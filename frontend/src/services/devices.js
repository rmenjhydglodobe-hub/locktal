import { generateDeviceKeys, saveDevice } from "./deviceStorage.js";

const API_URL = "http://127.0.0.1:8000";

export class DeviceApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "DeviceApiError";
    this.status = status;
  }
}

export function deviceCryptoAvailable() {
  return Boolean(window.crypto?.subtle && window.indexedDB);
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function exportPublicKey(publicKey) {
  const spki = await window.crypto.subtle.exportKey("spki", publicKey);
  return bytesToBase64(spki);
}

async function signMessage(privateKey, message) {
  const data = new TextEncoder().encode(message);
  const signature = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data,
  );

  return bytesToBase64(signature);
}

async function postJson(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      typeof data?.detail === "string" ? data.detail : "Request failed.";
    throw new DeviceApiError(response.status, detail);
  }

  return data;
}

export async function registerNewDevice(loginTicket, deviceName, userId) {
  const keys = await generateDeviceKeys();
  const publicKeySpki = await exportPublicKey(keys.publicKey);

  const challenge = await postJson("/devices/registration/challenge", {
    login_ticket: loginTicket,
    device_name: deviceName,
    public_key_spki: publicKeySpki,
  });

  // Save the key before completing. If the final response is lost, the next
  // login retries as a returning device instead of leaving an orphan record.
  await saveDevice({
    userId,
    deviceId: challenge.device_id,
    deviceName,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    createdAt: new Date().toISOString(),
  });

  const signature = await signMessage(keys.privateKey, challenge.message);

  return postJson("/devices/registration/complete", {
    login_ticket: loginTicket,
    device_id: challenge.device_id,
    challenge_id: challenge.challenge_id,
    signature,
  });
}

export async function loginReturningDevice(loginTicket, device) {
  const challenge = await postJson("/devices/login/challenge", {
    login_ticket: loginTicket,
    device_id: device.deviceId,
  });

  const signature = await signMessage(device.privateKey, challenge.message);

  return postJson("/devices/login/complete", {
    login_ticket: loginTicket,
    device_id: device.deviceId,
    challenge_id: challenge.challenge_id,
    signature,
  });
}

export async function listDevices(token) {
  const response = await fetch(`${API_URL}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Could not load devices.");
  }

  return response.json();
}

export async function renameDevice(token, deviceId, deviceName) {
  const response = await fetch(`${API_URL}/devices/${deviceId}/name`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ device_name: deviceName }),
  });

  if (!response.ok) {
    throw new Error("Could not rename the device.");
  }

  return response.json();
}

export async function revokeDevice(token, deviceId) {
  const response = await fetch(`${API_URL}/devices/${deviceId}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Could not revoke the device.");
  }

  return response.json();
}
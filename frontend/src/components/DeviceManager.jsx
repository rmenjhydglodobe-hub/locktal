import { useEffect, useState } from "react";
import {
  listDevices,
  renameDevice,
  revokeDevice,
} from "../services/devices.js";
import "../styles/registration.css";

export default function DeviceManager({ sessionToken, onCurrentDeviceRevoked }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceError, setDeviceError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      setLoading(true);
      setDeviceError("");

      try {
        const result = await listDevices(sessionToken);
        if (!cancelled) setDevices(result.devices);
      } catch {
        if (!cancelled) setDeviceError("Could not load devices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDevices();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  function startRename(device) {
    setEditingId(device.device_id);
    setNewName(device.device_name);
    setConfirmRevokeId(null);
    setDeviceError("");
  }

  async function handleRename(event) {
    event.preventDefault();

    const name = newName.trim();
    if (!name || saving) return;

    setSaving(true);
    setDeviceError("");

    try {
      const result = await renameDevice(sessionToken, editingId, name);

      setDevices((current) =>
        current.map((device) =>
          device.device_id === result.device_id
            ? { ...device, device_name: result.device_name }
            : device,
        ),
      );

      setEditingId(null);
      setNewName("");
    } catch {
      setDeviceError("Could not rename the device. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(deviceId) {
    if (revoking) return;

    setRevoking(true);
    setDeviceError("");

    try {
      const result = await revokeDevice(sessionToken, deviceId);

      if (result.was_current) {
        onCurrentDeviceRevoked();
        return;
      }

      setDevices((current) =>
        current.map((device) =>
          device.device_id === deviceId
            ? { ...device, revoked_at: "Revoked" }
            : device,
        ),
      );

      setConfirmRevokeId(null);
    } catch {
      setDeviceError(
        "Could not confirm revocation. Refresh the page and check the device list.",
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="device-list">
      <h3>Your devices</h3>

      {loading && <p>Loading devices...</p>}
      {deviceError && <p role="alert">{deviceError}</p>}

      {!loading && !deviceError && devices.length === 0 && (
        <p>No devices found.</p>
      )}

      {devices.map((device) => (
        <div className="device-card" key={device.device_id}>
          <strong>
            {device.device_name}
            {device.is_current ? " (this device)" : ""}
          </strong>
          <span>Status: {device.revoked_at ? "Revoked" : "Active"}</span>
          <span>Added: {device.created_at || "Unknown"}</span>
          <span>Last activity: {device.last_activity_at || "Unknown"}</span>

          {editingId === device.device_id ? (
            <form className="registration-form" onSubmit={handleRename}>
              <label htmlFor={`name-${device.device_id}`}>New name</label>
              <input
                id={`name-${device.device_id}`}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={100}
                required
              />
              <div className="button-row">
                <button type="submit" disabled={saving || !newName.trim()}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            !device.revoked_at && (
              <div className="registration-form">
                <button
                  type="button"
                  disabled={saving || revoking}
                  onClick={() => startRename(device)}
                >
                  Rename
                </button>
              </div>
            )
          )}

          {!device.revoked_at && (
            <div className="registration-form">
              {confirmRevokeId === device.device_id ? (
                <>
                  <p className="warning">
                    Revoke this device? It will lose access, but data already
                    copied to it cannot be erased remotely.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={revoking}
                      onClick={() => handleRevoke(device.device_id)}
                    >
                      {revoking ? "Revoking..." : "Confirm revoke"}
                    </button>
                    <button
                      type="button"
                      disabled={revoking}
                      onClick={() => setConfirmRevokeId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  disabled={saving || revoking}
                  onClick={() => {
                    setEditingId(null);
                    setConfirmRevokeId(device.device_id);
                    setDeviceError("");
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
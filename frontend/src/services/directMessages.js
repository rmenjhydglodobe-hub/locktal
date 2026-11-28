const API_URL = "http://127.0.0.1:8000";

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Request failed.",
    );
  }

  return data;
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listMessages(token, contactId) {
  const response = await fetch(
    `${API_URL}/direct-messages/${encodeURIComponent(normalizeId(contactId))}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return readResponse(response);
}

export async function sendMessage(token, recipientId, body) {
  const response = await fetch(`${API_URL}/direct-messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient_user_id: normalizeId(recipientId),
      body,
    }),
  });

  return readResponse(response);
}

export async function acknowledgeDelivery(token, contactId, messageIds) {
  const response = await fetch(
    `${API_URL}/direct-messages/${encodeURIComponent(normalizeId(contactId))}/delivered`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message_ids: messageIds }),
    },
  );

  return readResponse(response);
}

export async function markMessagesSeen(token, contactId, messageIds) {
  const response = await fetch(
    `${API_URL}/direct-messages/${encodeURIComponent(normalizeId(contactId))}/seen`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message_ids: messageIds }),
    },
  );

  return readResponse(response);
}

export async function listChatHistory(token) {
  const response = await fetch(`${API_URL}/direct-messages/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return readResponse(response);
}
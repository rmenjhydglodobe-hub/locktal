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

export async function sendMessageRequest(token, recipientUserId) {
  const response = await fetch(`${API_URL}/message-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ recipient_user_id: recipientUserId }),
  });

  return readResponse(response);
}

export async function listIncomingRequests(token) {
  const response = await fetch(`${API_URL}/message-requests/incoming`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return readResponse(response);
}

export async function respondToRequest(token, requestId, action) {
  const response = await fetch(
    `${API_URL}/message-requests/${requestId}/respond`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    },
  );

  return readResponse(response);
}

export async function listContacts(token) {
  const response = await fetch(`${API_URL}/message-requests/contacts`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return readResponse(response);
}

export async function listBlockedUsers(token) {
  const response = await fetch(`${API_URL}/message-requests/blocks`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return readResponse(response);
}

export async function blockUser(token, userId) {
  const response = await fetch(
    `${API_URL}/message-requests/blocks/${userId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return readResponse(response);
}

export async function unblockUser(token, userId) {
  const response = await fetch(
    `${API_URL}/message-requests/blocks/${userId}/unblock`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return readResponse(response);
}
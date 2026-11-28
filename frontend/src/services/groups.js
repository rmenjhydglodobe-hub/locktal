const API_URL = "http://127.0.0.1:8000";

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
  }
  return data;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function listGroups(token) {
  return readResponse(await fetch(`${API_URL}/groups`, { headers: auth(token) }));
}

export async function createGroup(token, name) {
  return readResponse(
    await fetch(`${API_URL}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function listGroupMembers(token, groupId) {
  return readResponse(
    await fetch(`${API_URL}/groups/${groupId}/members`, { headers: auth(token) }),
  );
}

export async function addGroupMember(token, groupId, userId) {
  return readResponse(
    await fetch(`${API_URL}/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify({ user_id: userId }),
    }),
  );
}

export async function leaveGroup(token, groupId) {
  return readResponse(
    await fetch(`${API_URL}/groups/${groupId}/leave`, {
      method: "POST",
      headers: auth(token),
    }),
  );
}

export async function listGroupMessages(token, groupId) {
  return readResponse(
    await fetch(`${API_URL}/groups/${groupId}/messages`, { headers: auth(token) }),
  );
}

export async function sendGroupMessage(token, groupId, body) {
  return readResponse(
    await fetch(`${API_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify({ body }),
    }),
  );
}

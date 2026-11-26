const API_URL = "http://127.0.0.1:8000";

export async function searchUsers(token, query) {
  const params = new URLSearchParams({ q: query });

  const response = await fetch(`${API_URL}/users/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Could not search users.");
  }

  return response.json();
}
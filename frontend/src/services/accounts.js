const API_URL = "http://127.0.0.1:8000";

export async function registerAccount(displayName, accountKey) {
  const response = await fetch(`${API_URL}/accounts/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      account_key: accountKey,
    }),
  });

  if (!response.ok) {
    throw new Error("Registration failed.");
  }

  return response.json();
}

export async function login(displayName, accountKey) {
  const response = await fetch(`${API_URL}/accounts/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      account_key: accountKey,
    }),
  });

  if (response.status === 401 || response.status === 422) {
    throw new Error("Invalid display name or account key.");
  }

  if (!response.ok) {
    throw new Error("Could not log in. Please try again.");
  }

  return response.json();
}

export async function getCurrentSession(token) {
  const response = await fetch(`${API_URL}/sessions/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not check the session.");
  }

  return response.json();
}

export async function logout(token) {
  const response = await fetch(`${API_URL}/sessions/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Could not end the server session.");
  }
}
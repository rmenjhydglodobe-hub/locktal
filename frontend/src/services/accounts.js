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

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Registration failed.",
    );
  }

  return data;
}

export async function login(identifier, accountKey) {
  const trimmed = identifier.trim();
  const body = {
    account_key: accountKey.trim(),
  };

  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    body.user_id = trimmed.toLowerCase();
  } else {
    body.display_name = trimmed;
  }

  const response = await fetch(`${API_URL}/accounts/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Could not log in. Please try again.",
    );
  }

  return data;
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
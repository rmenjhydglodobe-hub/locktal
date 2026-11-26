const API_URL = "http://127.0.0.1:8000";

export async function listNotifications(token) {
  const response = await fetch(`${API_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Could not load notifications.");
  }

  return response.json();
}

export async function markNotificationRead(token, notificationId) {
  const response = await fetch(
    `${API_URL}/notifications/${notificationId}/read`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error("Could not mark notification as read.");
  }

  return response.json();
}
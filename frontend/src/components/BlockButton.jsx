import { useState } from "react";
import { blockUser } from "../services/messageRequests.js";

export default function BlockButton({
  sessionToken,
  userId,
  displayName,
  onBlocked,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleBlock() {
    if (busy) return;

    const confirmed = window.confirm(
      `Block ${displayName}?\n\n` +
        "Any pending request or accepted contact relationship will be removed. " +
        "Unblocking later will not restore it.",
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      await blockUser(sessionToken, userId);
      setMessage("User blocked.");
      onBlocked?.();
    } catch (error) {
      setMessage(error.message || "Could not block this user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="registration-form">
      <button type="button" onClick={handleBlock} disabled={busy}>
        {busy ? "Blocking..." : "Block"}
      </button>

      {message && <p role="status">{message}</p>}
    </div>
  );
}
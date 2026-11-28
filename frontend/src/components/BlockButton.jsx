import { useState } from "react";
import { LoaderCircle, ShieldBan } from "lucide-react";
import { blockUser } from "../services/messageRequests.js";
import Icon from "./Icon.jsx";

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
    <div className="button-row">
      <button type="button" className="secondary" onClick={handleBlock} disabled={busy}>
        {busy ? <><Icon icon={LoaderCircle} size={15} className="spin" /> Blocking...</> : <><Icon icon={ShieldBan} size={15} /> Block</>}
      </button>
      {message && <p className="registration-notice" role="status" style={{ width: "100%" }}>{message}</p>}
    </div>
  );
}
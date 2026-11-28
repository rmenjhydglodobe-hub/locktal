import { useEffect, useState } from "react";
import { Clock3, LoaderCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { listChatHistory } from "../services/directMessages.js";
import Icon from "./Icon.jsx";

export default function ChatHistory({ sessionToken, refreshKey, onOpenChat }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await listChatHistory(sessionToken);
        if (!cancelled) setHistory(result.history || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load chat history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, refreshKey]);

  function startConfirm(item) {
    setConfirming(item);
    setConfirmValue("");
    setConfirmError("");
  }

  function submitConfirm(event) {
    event.preventDefault();
    if (!confirming) return;
    if (confirmValue.trim().toLowerCase() !== confirming.user_id) {
      setConfirmError("Public user ID does not match. Please enter the exact ID.");
      return;
    }
    onOpenChat({ user_id: confirming.user_id, display_name: confirming.display_name });
    setConfirming(null);
    setConfirmValue("");
    setConfirmError("");
  }

  return (
    <section className="contacts-list">
      <div className="section-header">
        <span className="section-icon"><Icon icon={Clock3} size={18} /></span>
        <h3>Recent chats</h3>
      </div>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading history...</p>}
      {error && <p className="registration-notice" role="alert">{error}</p>}

      {!loading && !error && history.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={MessageSquare} size={24} /></div>
          <p>No previous chats yet. Start by messaging a contact.</p>
        </div>
      )}

      {!loading && !error && history.map((item) => (
        <div className="user-result" key={item.user_id}>
          <div className="contact-header">
            <strong>{item.display_name}</strong>
            {Number(item.unread_count || 0) > 0 && (
              <span className="unread-badge">{item.unread_count} unread</span>
            )}
          </div>
          <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem" }}>{item.user_id}</span>
          <small>{item.last_message_from_me ? "You: " : ""}{item.last_message}</small>
          <small>{item.last_message_at || "Unknown time"}</small>
          <div className="button-row">
            <button type="button" onClick={() => startConfirm(item)}>
              <Icon icon={ShieldCheck} size={15} /> Reopen chat
            </button>
          </div>

          {confirming?.user_id === item.user_id && (
            <form className="registration-form" onSubmit={submitConfirm}>
              <label htmlFor={`confirm-id-${item.user_id}`}>Confirm public user ID to reopen</label>
              <input
                id={`confirm-id-${item.user_id}`}
                value={confirmValue}
                onChange={(e) => setConfirmValue(e.target.value)}
                placeholder="Enter the contact's public user ID"
                autoComplete="off"
                required
              />
              <div className="button-row">
                <button type="submit">Confirm and open</button>
                <button type="button" className="secondary" onClick={() => setConfirming(null)}>Cancel</button>
              </div>
              {confirmError && <p className="registration-notice" role="alert">{confirmError}</p>}
            </form>
          )}
        </div>
      ))}
    </section>
  );
}

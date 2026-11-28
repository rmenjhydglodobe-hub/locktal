import { useEffect, useState } from "react";
import { LoaderCircle, MessageSquare, RefreshCw, UserRound, Users } from "lucide-react";
import { listContacts } from "../services/messageRequests.js";
import BlockButton from "./BlockButton.jsx";
import Icon from "./Icon.jsx";

const CONTACTS_REFRESH_MS = 10000;

export default function ContactsList({
  sessionToken,
  refreshKey,
  onChanged,
  onOpenChat,
}) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(showLoading) {
      if (showLoading) {
        setLoading(true);
        setError("");
      }

      try {
        const result = await listContacts(sessionToken);

        if (!cancelled) {
          setContacts(result.contacts);
          if (showLoading) {
            setError("");
          }
        }
      } catch (err) {
        if (!cancelled && showLoading) {
          setContacts([]);
          setError(err.message || "Could not load contacts.");
        }
      } finally {
        if (!cancelled && showLoading) {
          setLoading(false);
        }
      }
    }

    load(true);

    const interval = window.setInterval(() => {
      load(false);
    }, CONTACTS_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionToken, refreshKey, reloadKey]);

  return (
    <section className="contacts-list">
      <div className="section-header">
        <span className="section-icon"><Icon icon={Users} size={18} /></span>
        <h3>Your contacts</h3>
      </div>

      <div className="button-row" style={{ marginBottom: 4 }}>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setReloadKey((current) => current + 1)}
        >
          <Icon icon={loading ? LoaderCircle : RefreshCw} size={15} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading contacts...</p>}
      {error && <p className="registration-notice" role="alert">{error}</p>}

      {!loading && !error && contacts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={UserRound} size={24} /></div>
          <p>No accepted contacts yet.</p>
        </div>
      )}

      {!loading &&
        !error &&
        contacts.map((contact) => {
          const unread = Number(contact.unread_count || 0);

          return (
            <div className="user-result" key={contact.user_id}>
              <div className="contact-header">
                <strong>{contact.display_name}</strong>
                {unread > 0 && (
                  <span className="unread-badge">{unread} unread</span>
                )}
              </div>
              <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem" }}>{contact.user_id}</span>
              <div className="button-row">
                <button type="button" onClick={() => onOpenChat(contact)}>
                  <Icon icon={MessageSquare} size={15} /> Open chat
                </button>
              </div>

              <BlockButton
                sessionToken={sessionToken}
                userId={contact.user_id}
                displayName={contact.display_name}
                onBlocked={onChanged}
              />
            </div>
          );
        })}
    </section>
  );
}
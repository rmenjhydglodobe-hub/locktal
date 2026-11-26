import { useEffect, useState } from "react";
import { listContacts } from "../services/messageRequests.js";
import BlockButton from "./BlockButton.jsx";

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
      <h3>Your contacts</h3>

      <div className="registration-form">
        <button
          type="button"
          disabled={loading}
          onClick={() => setReloadKey((current) => current + 1)}
        >
          Refresh contacts
        </button>
      </div>

      {loading && <p>Loading contacts...</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && !error && contacts.length === 0 && (
        <p>No accepted contacts yet.</p>
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
                  <span className="unread-badge">
                    {unread} unread
                  </span>
                )}
              </div>
              <span>Public ID: {contact.user_id}</span>
              <div className="registration-form">
                <button type="button" onClick={() => onOpenChat(contact)}>
                  Open chat
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
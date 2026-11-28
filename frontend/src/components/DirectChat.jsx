import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCheck, LoaderCircle, MessageSquare, Send } from "lucide-react";
import {
  acknowledgeDelivery,
  listMessages,
  markMessagesSeen,
  sendMessage,
} from "../services/directMessages.js";
import Icon from "./Icon.jsx";
import MessageText from "./MessageText";

const REFRESH_INTERVAL_MS = 5000;

export default function DirectChat({
  account,
  contact,
  sessionToken,
  onChooseContact,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const mounted = useRef(false);

  // Message IDs whose acknowledgment is currently being sent.
  const acknowledging = useRef(new Set());

  // Incoming IDs already marked as seen in this chat session.
  // Kept locally because the messages response does not include
  // recipient_seen_at, so the sender cannot see a read receipt.
  const seenSent = useRef(new Set());

  // Avoid updating this component after the user leaves the chat.
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestInProgress = false;

    async function acknowledgeReceived(loadedMessages) {
      // Only messages sent to this account by this contact, not yet
      // acknowledged, and not already being acknowledged.
      const ids = loadedMessages
        .filter(
          (item) =>
            item.sender_user_id === contact.user_id &&
            item.recipient_user_id === account.user_id &&
            !item.delivered_at &&
            !acknowledging.current.has(item.message_id),
        )
        .map((item) => item.message_id);

      if (ids.length === 0) return;

      ids.forEach((id) => acknowledging.current.add(id));

      try {
        await acknowledgeDelivery(sessionToken, contact.user_id, ids);
      } catch {
        // Not shown to the user; the next refresh will try again.
      } finally {
        ids.forEach((id) => acknowledging.current.delete(id));
      }
    }

    async function markLoadedSeen(loadedMessages) {
      const ids = loadedMessages
        .filter(
          (item) =>
            item.sender_user_id === contact.user_id &&
            item.recipient_user_id === account.user_id &&
            !seenSent.current.has(item.message_id),
        )
        .map((item) => item.message_id);

      if (ids.length === 0) return;

      ids.forEach((id) => seenSent.current.add(id));

      try {
        await markMessagesSeen(sessionToken, contact.user_id, ids);
      } catch {
        // Allow retry on the next refresh.
        ids.forEach((id) => seenSent.current.delete(id));
      }
    }

    async function loadMessages(showLoading = false) {
      if (requestInProgress) return;

      requestInProgress = true;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const result = await listMessages(sessionToken, contact.user_id);

        if (!cancelled) {
          setMessages(result.messages);
          setError("");
          acknowledgeReceived(result.messages);
          markLoadedSeen(result.messages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load messages.");
        }
      } finally {
        requestInProgress = false;

        if (!cancelled && showLoading) {
          setLoading(false);
        }
      }
    }

    // Load immediately when opening the chat or after sending.
    loadMessages(true);

    // Refresh quietly while the chat remains open.
    const interval = window.setInterval(() => {
      loadMessages(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionToken, contact.user_id, account.user_id, refreshKey]);

  function refreshMessages() {
    setRefreshKey((current) => current + 1);
  }

  async function handleSend(event) {
    event.preventDefault();

    const body = draft.trim();
    if (!body || sending || loading) return;

    setSending(true);
    setError("");

    try {
      await sendMessage(sessionToken, contact.user_id, body);

      if (mounted.current) {
        setDraft("");
        refreshMessages();
      }
    } catch (err) {
      if (mounted.current) {
        setError(
          (err.message || "Could not send the message.") +
            " If the connection failed, refresh before retrying: " +
            "the message may already have been saved.",
        );
      }
    } finally {
      if (mounted.current) {
        setSending(false);
      }
    }
  }

  const initial = Array.from(contact.display_name.trim())[0]?.toUpperCase() || "?";

  return (
    <div className="direct-chat">
      <div className="ws-chat-contact">
        <div className="ws-chat-contact-info">
          <span className="ws-chat-avatar" aria-hidden="true">{initial}</span>
          <div>
            <h3>{contact.display_name}</h3>
            <p>{contact.user_id}</p>
          </div>
        </div>

        <button type="button" onClick={onChooseContact}>
          <Icon icon={ArrowLeft} size={16} /> Contacts
        </button>
      </div>

      <p className="direct-chat-warning">
        <Icon icon={AlertTriangle} size={16} />
        <span>Messages are stored as plaintext and are not encrypted. Use dummy text only.</span>
      </p>

      {error && (
        <p className="direct-chat-error" role="alert">
          {error}
        </p>
      )}

      {loading && messages.length === 0 && (
        <div className="direct-chat-empty">
          <Icon icon={LoaderCircle} size={24} className="spin" />
          <span>Loading messages...</span>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="direct-chat-empty">
          <div className="empty-state-icon"><Icon icon={MessageSquare} size={24} /></div>
          <span>No messages yet. Say hello.</span>
        </div>
      )}

      <div className="direct-chat-messages" aria-label="Messages">
        {messages.map((item) => {
          const mine = item.sender_user_id === account.user_id;

          return (
            <article
              className={`direct-message ${mine ? "mine" : "theirs"}`}
              key={item.message_id}
            >
              <strong>{mine ? "You" : contact.display_name}</strong>
              <p><MessageText text={item.body} /></p>
              <small>
                {item.created_at || "Unknown time"}
                {mine && (
                  <span className={`direct-message-status ${item.delivered_at ? "delivered" : "sent"}`}>
                    <Icon icon={item.delivered_at ? CheckCheck : Check} size={14} />
                    {item.delivered_at ? "Delivered" : "Sent"}
                  </span>
                )}
              </small>
            </article>
          );
        })}
      </div>

      <form className="direct-chat-composer" onSubmit={handleSend}>
        <label htmlFor="direct-message-input">Message</label>
        <div className="direct-chat-composer-row">
          <textarea
            id="direct-message-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={4000}
            rows={2}
            placeholder="Type a test message..."
            disabled={sending}
          />

          <button
            type="submit"
            disabled={sending || loading || !draft.trim()}
            aria-label={sending ? "Sending message" : "Send message"}
          >
            {sending ? <Icon icon={LoaderCircle} size={16} className="spin" /> : <Icon icon={Send} size={16} />}
            {sending ? "Sending" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
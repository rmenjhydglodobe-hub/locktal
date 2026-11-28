import { useEffect, useState } from "react";
import { Check, Inbox, LoaderCircle, Mail, X } from "lucide-react";
import BlockButton from "./BlockButton.jsx";
import Icon from "./Icon.jsx";

import {
  listIncomingRequests,
  respondToRequest,
} from "../services/messageRequests.js";

export default function IncomingRequests({
  sessionToken,
  refreshKey,
  onAccepted,
}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [message, setMessage] = useState("");

  async function loadRequests() {
    setLoading(true);

    try {
      const result = await listIncomingRequests(sessionToken);
      setRequests(result.requests);
    } catch (error) {
      setMessage(error.message || "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const result = await listIncomingRequests(sessionToken);
        if (!cancelled) setRequests(result.requests);
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Could not load requests.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, refreshKey]);

  async function handleResponse(request, action) {
    if (workingId) return;

    setWorkingId(request.request_id);
    setMessage("");

    try {
      await respondToRequest(sessionToken, request.request_id, action);
      if (action === "accept") {
        onAccepted?.();
      }
      setRequests((current) =>
        current.filter((item) => item.request_id !== request.request_id),
      );
      setMessage(`Request ${action === "accept" ? "accepted" : "declined"}.`);
    } catch (error) {
      setMessage(error.message || "Could not respond to the request.");
      await loadRequests();
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="incoming-requests">
      <div className="section-header">
        <span className="section-icon"><Icon icon={Mail} size={18} /></span>
        <h3>Message requests</h3>
      </div>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading requests...</p>}
      {message && <p className="registration-notice" role="status">{message}</p>}

      {!loading && requests.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={Inbox} size={24} /></div>
          <p>No incoming requests.</p>
        </div>
      )}

      {requests.map((request) => (
        <div className="user-result" key={request.request_id}>
          <strong>{request.sender_display_name}</strong>
          <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem" }}>{request.sender_user_id}</span>
          <small>Received: {request.created_at || "Unknown time"}</small>

          <div className="button-row">
            <button
              type="button"
              disabled={Boolean(workingId)}
              onClick={() => handleResponse(request, "accept")}
            >
              {workingId === request.request_id ? <Icon icon={LoaderCircle} size={15} className="spin" /> : <Icon icon={Check} size={15} />} Accept
            </button>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(workingId)}
              onClick={() => handleResponse(request, "decline")}
            >
              <Icon icon={X} size={15} /> Decline
            </button>
          </div>

          <BlockButton
            sessionToken={sessionToken}
            userId={request.sender_user_id}
            displayName={request.sender_display_name}
            onBlocked={onAccepted}
          />
        </div>
      ))}
    </section>
  );
}
import { useEffect, useState } from "react";
import BlockButton from "./BlockButton.jsx";

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
      <h3>Message requests</h3>

      {loading && <p>Loading requests...</p>}
      {message && <p role="status">{message}</p>}

      {!loading && requests.length === 0 && <p>No incoming requests.</p>}

      {requests.map((request) => (
        <div className="user-result" key={request.request_id}>
          <strong>{request.sender_display_name}</strong>
          <span>Public ID: {request.sender_user_id}</span>
          <span>Received: {request.created_at || "Unknown time"}</span>

          <div className="registration-form button-row">
            <button
              type="button"
              disabled={Boolean(workingId)}
              onClick={() => handleResponse(request, "accept")}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={Boolean(workingId)}
              onClick={() => handleResponse(request, "decline")}
            >
              Decline
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
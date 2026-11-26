import { useState } from "react";
import { searchUsers } from "../services/users.js";
import { sendMessageRequest } from "../services/messageRequests.js";
import BlockButton from "./BlockButton.jsx";

const USER_ID_PATTERN = /^[0-9a-f]{32}$/;

export default function UserSearch({ sessionToken, onRequestChanged }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [message, setMessage] = useState("");

  async function handleSearch(event) {
    event.preventDefault();
    if (loading) return;

    const value = query.trim();
    setUsers([]);
    setSearched(false);
    setMessage("");

    if (!USER_ID_PATTERN.test(value)) {
      setMessage("Enter the full public user ID: 32 lowercase letters and numbers.");
      return;
    }

    setLoading(true);

    try {
      const result = await searchUsers(sessionToken, value);
      setUsers(result.users);
      setSearched(true);
    } catch {
      setMessage("Could not search users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(user) {
    if (sendingId) return;

    setSendingId(user.user_id);
    setMessage("");

    try {
      const result = await sendMessageRequest(sessionToken, user.user_id);

      const messages = {
        sent: "Request sent.",
        accepted: "The existing request was accepted.",
        already_pending: "You already have a pending request to this user.",
        already_accepted: "Your request has already been accepted.",
      };

      setMessage(messages[result.result] || "Request processed.");
      onRequestChanged();
    } catch (error) {
      setMessage(error.message || "Could not send the request.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <section className="user-search">
      <h3>Find users</h3>
      <p>Search using the full public user ID.</p>

      <form className="registration-form" onSubmit={handleSearch}>
        <label htmlFor="user-search-query">Public user ID</label>
        <input
          id="user-search-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={32}
          autoComplete="off"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      {searched && !loading && users.length === 0 && (
        <p>No users found.</p>
      )}

      {users.map((user) => (
        <div className="user-result" key={user.user_id}>
          <strong>{user.display_name}</strong>
          <span>Public ID: {user.user_id}</span>
          <div className="registration-form">
            <button
              type="button"
              disabled={Boolean(sendingId)}
              onClick={() => handleSend(user)}
            >
              {sendingId === user.user_id ? "Sending..." : "Send request"}
            </button>
          </div>

          <BlockButton
            sessionToken={sessionToken}
            userId={user.user_id}
            displayName={user.display_name}
            onBlocked={onRequestChanged}
          />
        </div>
      ))}

      <p className="user-search-note">
        A display name or public ID alone does not prove someone’s identity.
      </p>
    </section>
  );
}
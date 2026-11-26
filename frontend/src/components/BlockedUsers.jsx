import { useEffect, useState } from "react";
import {
  listBlockedUsers,
  unblockUser,
} from "../services/messageRequests.js";

export default function BlockedUsers({
  sessionToken,
  refreshKey,
  onChanged,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage("");

      try {
        const result = await listBlockedUsers(sessionToken);

        if (!cancelled) {
          setUsers(result.users);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Could not load blocked users.");
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

  async function handleUnblock(user) {
    if (workingId) return;

    const confirmed = window.confirm(
      `Unblock ${user.display_name}?\n\n` +
        "Your previous contact relationship will not be restored.",
    );

    if (!confirmed) return;

    setWorkingId(user.user_id);
    setMessage("");

    try {
      await unblockUser(sessionToken, user.user_id);
      onChanged?.();
    } catch (error) {
      setMessage(error.message || "Could not unblock this user.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="blocked-users">
      <h3>Blocked users</h3>

      {loading && <p>Loading blocked users...</p>}
      {message && <p role="alert">{message}</p>}

      {!loading && !message && users.length === 0 && (
        <p>You haven’t blocked anyone.</p>
      )}

      {!loading &&
        users.map((user) => (
          <div className="user-result" key={user.user_id}>
            <strong>{user.display_name}</strong>
            <span>Public ID: {user.user_id}</span>

            <div className="registration-form">
              <button
                type="button"
                disabled={Boolean(workingId)}
                onClick={() => handleUnblock(user)}
              >
                {workingId === user.user_id ? "Unblocking..." : "Unblock"}
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
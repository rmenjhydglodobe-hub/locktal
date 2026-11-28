import { useEffect, useState } from "react";
import { LoaderCircle, ShieldOff, UserX } from "lucide-react";
import {
  listBlockedUsers,
  unblockUser,
} from "../services/messageRequests.js";
import Icon from "./Icon.jsx";

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
      <div className="section-header">
        <span className="section-icon"><Icon icon={ShieldOff} size={18} /></span>
        <h3>Blocked users</h3>
      </div>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading blocked users...</p>}
      {message && <p className="registration-notice" role="alert">{message}</p>}

      {!loading && !message && users.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={UserX} size={24} /></div>
          <p>No blocked users.</p>
        </div>
      )}

      {!loading &&
        users.map((user) => (
          <div className="user-result" key={user.user_id}>
            <strong>{user.display_name}</strong>
            <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem" }}>{user.user_id}</span>

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                disabled={Boolean(workingId)}
                onClick={() => handleUnblock(user)}
              >
                {workingId === user.user_id ? <><Icon icon={LoaderCircle} size={15} className="spin" /> Unblocking...</> : "Unblock"}
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
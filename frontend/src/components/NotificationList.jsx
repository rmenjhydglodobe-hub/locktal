import { useEffect, useState } from "react";
import { Bell, Check, Inbox, LoaderCircle } from "lucide-react";
import {
  listNotifications,
  markNotificationRead,
} from "../services/notifications.js";
import Icon from "./Icon.jsx";

export default function NotificationList({ sessionToken }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await listNotifications(sessionToken);
        if (!cancelled) setNotifications(result.notifications);
      } catch {
        if (!cancelled) setError("Could not load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  async function handleMarkRead(notification) {
    if (markingId || notification.read_at) return;

    setMarkingId(notification.notification_id);
    setError("");

    try {
      await markNotificationRead(sessionToken, notification.notification_id);

      setNotifications((current) =>
        current.map((item) =>
          item.notification_id === notification.notification_id
            ? { ...item, read_at: "Read" }
            : item,
        ),
      );
    } catch {
      setError("Could not mark the notification as read.");
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <section className="notification-list">
      <div className="section-header">
        <span className="section-icon"><Icon icon={Bell} size={18} /></span>
        <h3>Notifications</h3>
      </div>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading notifications...</p>}
      {error && <p className="registration-notice" role="alert">{error}</p>}

      {!loading && !error && notifications.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={Inbox} size={24} /></div>
          <p>No notifications yet.</p>
        </div>
      )}

      {notifications.map((notification) => (
        <div
          className={"notification-card" + (notification.read_at ? " read" : "")}
          key={notification.notification_id}
        >
          <span>{notification.message}</span>
          <small>{notification.created_at || "Unknown time"}</small>

          {!notification.read_at && (
            <button
              type="button"
              className="secondary"
              disabled={markingId === notification.notification_id}
              onClick={() => handleMarkRead(notification)}
            >
              {markingId === notification.notification_id ? <><Icon icon={LoaderCircle} size={14} className="spin" /> Updating...</> : <><Icon icon={Check} size={14} /> Mark as read</>}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
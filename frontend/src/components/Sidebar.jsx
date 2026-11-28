import {
  Bell,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Users,
  UsersRound,
} from "lucide-react";
import Icon from "./Icon.jsx";

const workspaceItems = [
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const systemItems = [{ id: "settings", label: "Settings", icon: Settings }];

export default function Sidebar({
  section,
  onSelect,
  theme,
  onThemeChange,
  account,
  onLogout,
  logoutBusy,
}) {
  const initial =
    Array.from(account.display_name.trim())[0]?.toUpperCase() || "?";
  const shortId =
    account.user_id.slice(0, 8) + "…" + account.user_id.slice(-4);

  function renderItem(item) {
    const ItemIcon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className={section === item.id ? "active" : ""}
        aria-current={section === item.id ? "page" : undefined}
        onClick={() => onSelect(item.id)}
      >
        <Icon icon={ItemIcon} size={18} className="nav-icon" />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <aside className="ws-sidebar">
      <div className="ws-brand">
        <span className="ws-brand-icon">
          <Icon icon={Lock} size={20} />
        </span>
        <strong>
          Lock<span>Talk</span>
        </strong>
      </div>

      <nav className="ws-nav" aria-label="Main navigation">
        <p className="ws-nav-label">Workspace</p>
        {workspaceItems.map(renderItem)}

        <p className="ws-nav-label">System</p>
        {systemItems.map(renderItem)}
      </nav>

      <div className="ws-sidebar-footer">
        <div className="ws-theme">
          <span className="ws-theme-label">
            <Icon icon={theme === "dark" ? Moon : Sun} size={15} /> Theme
          </span>
          <div className="ws-theme-buttons">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => onThemeChange("light")}
              aria-label="Light theme"
              aria-pressed={theme === "light"}
            >
              <Icon icon={Sun} size={14} />
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => onThemeChange("dark")}
              aria-label="Dark theme"
              aria-pressed={theme === "dark"}
            >
              <Icon icon={Moon} size={14} />
            </button>
          </div>
        </div>

        <div className="ws-account">
          <span className="ws-avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="ws-account-text">
            <strong>{account.display_name}</strong>
            <small>{shortId}</small>
          </div>
          <button
            type="button"
            className="ws-logout"
            onClick={onLogout}
            disabled={logoutBusy}
            aria-label={logoutBusy ? "Logging out" : "Log out"}
            title="Log out"
          >
            <Icon icon={LogOut} size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
const workspaceItems = [
  { id: "chats", label: "Chats" },
  { id: "contacts", label: "Contacts" },
  { id: "groups", label: "Groups" },
  { id: "notifications", label: "Notifications" },
];

const systemItems = [{ id: "settings", label: "Settings" }];

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
    return (
      <button
        key={item.id}
        type="button"
        className={section === item.id ? "active" : ""}
        aria-current={section === item.id ? "page" : undefined}
        onClick={() => onSelect(item.id)}
      >
        {item.label}
      </button>
    );
  }

  return (
    <aside className="ws-sidebar">
      <div className="ws-brand">
        <span className="ws-brand-icon" aria-hidden="true">
          🔒
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
          <span>Theme</span>
          <div className="ws-theme-buttons">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => onThemeChange("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => onThemeChange("dark")}
            >
              Dark
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
          >
            {logoutBusy ? "..." : "Log out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
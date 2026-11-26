import "../styles/auth-layout.css";

export default function AuthLayout({ children, theme, onThemeChange }) {
  return (
    <div className="auth-layout" data-theme={theme}>
      <section className="auth-introduction">
        <div className="auth-brand">
          <span className="auth-brand-icon" aria-hidden="true">
            🔒
          </span>
          <strong>
            Lock<span>Talk</span>
          </strong>
        </div>

        <div className="auth-intro-content">
          <div className="auth-shield" aria-hidden="true">
            🔒
          </div>

          <h1>Welcome to LockTalk</h1>

          <p>
            A local messaging prototype for exploring conversations, contacts,
            and groups.
          </p>

          <p className="auth-prototype-note">
            Unaudited prototype. Messaging encryption is not implemented yet.
            Do not use sensitive information.
          </p>
        </div>
      </section>

      <section className="auth-panel" aria-label="Account access">
        <div className="auth-theme" role="group" aria-label="Choose theme">
          <span>Theme</span>

          <div className="auth-theme-buttons">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              Light
            </button>

            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              Dark
            </button>
          </div>
        </div>

        {children}
      </section>
    </div>
  );
}
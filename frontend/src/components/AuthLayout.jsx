import { Lock, Moon, Shield, Sun, MessageSquare, Users } from "lucide-react";
import Icon from "./Icon.jsx";
import "../styles/auth-layout.css";

export default function AuthLayout({ children, theme, onThemeChange }) {
  return (
    <div className="auth-layout" data-theme={theme}>
      <section className="auth-introduction">
        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Icon icon={Lock} size={20} />
          </span>
          <strong>
            Lock<span>Talk</span>
          </strong>
        </div>

        <div className="auth-intro-content">
          <div className="auth-shield">
            <Icon icon={Shield} size={52} strokeWidth={1.5} />
          </div>

          <h1>Private conversations, built with care.</h1>

          <p>
            A local messaging prototype for exploring secure device sign-in,
            contacts, and direct messages.
          </p>

          <div className="auth-features" aria-hidden="true">
            <div className="auth-feature">
              <span className="auth-feature-icon"><Icon icon={Shield} size={18} /></span>
              <div>
                <strong>Device-based access</strong>
                <span>Each browser registers its own cryptographic device key.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon"><Icon icon={MessageSquare} size={18} /></span>
              <div>
                <strong>Direct messaging</strong>
                <span>Send requests, accept contacts, and chat in real time.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon"><Icon icon={Users} size={18} /></span>
              <div>
                <strong>Contact control</strong>
                <span>Manage requests, block users, and review devices.</span>
              </div>
            </div>
          </div>

          <p className="auth-prototype-note">
            Unaudited prototype. Messages are not end-to-end encrypted yet. Do not
            use sensitive information.
          </p>
        </div>
      </section>

      <section className="auth-panel" aria-label="Account access">
        <div className="auth-theme" role="group" aria-label="Choose theme">
          <span className="auth-theme-label">
            <Icon icon={theme === "dark" ? Moon : Sun} size={16} /> Theme
          </span>

          <div className="auth-theme-buttons">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              <Icon icon={Sun} size={15} /> Light
            </button>

            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              <Icon icon={Moon} size={15} /> Dark
            </button>
          </div>
        </div>

        {children}
      </section>
    </div>
  );
}
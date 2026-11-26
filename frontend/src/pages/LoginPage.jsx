import { useState } from "react";
import { login } from "../services/accounts.js";
import { getDevice } from "../services/deviceStorage.js";
import {
  DeviceApiError,
  deviceCryptoAvailable,
  loginReturningDevice,
  registerNewDevice,
} from "../services/devices.js";
import "../styles/registration.css";

export default function LoginPage({ onLogin }) {
  const [displayName, setDisplayName] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function describeError(error) {
    if (error instanceof DeviceApiError) return error.message;
    if (error instanceof TypeError) {
      return "Could not reach the backend. Is LockTalk running?";
    }
    return error?.message || "Could not log in. Please try again.";
  }

  async function finishAsNewDevice(ticket, id, name) {
    const result = await registerNewDevice(ticket, name, id);
    onLogin(result);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    if (!deviceCryptoAvailable()) {
      setMessage(
        "This browser context cannot create device keys. Use localhost or HTTPS.",
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const account = await login(displayName.trim(), accountKey.trim());
      setAccountKey("");

      // The backend returns the public ID after checking the credentials.
      const id = account.user_id;
      const ticket = account.login_ticket;
      const device = await getDevice(id);

      if (device) {
        try {
          const result = await loginReturningDevice(ticket, device);
          onLogin(result);
          return;
        } catch (error) {
          if (error instanceof DeviceApiError && error.status === 404) {
            setPendingLogin({ ticket, userId: id });
            setMessage(
              "This browser's earlier device registration was revoked or not " +
                "found. Enter a name to register it as a new device.",
            );
            return;
          }
          throw error;
        }
      }

      setPendingLogin({ ticket, userId: id });
      setMessage("Enter a name for this device to finish logging in.");
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterDevice(event) {
    event.preventDefault();
    if (busy || !pendingLogin) return;

    const name = deviceName.trim();
    if (!name) {
      setMessage("Please enter a device name.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await finishAsNewDevice(pendingLogin.ticket, pendingLogin.userId, name);
    } catch (error) {
      if (error instanceof DeviceApiError && error.status === 401) {
        setPendingLogin(null);
        setMessage("Login attempt expired. Please enter your account key again.");
      } else {
        setMessage(describeError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  function cancelPending() {
    setPendingLogin(null);
    setMessage("");
  }

  if (pendingLogin) {
    return (
      <main className="content">
        <div className="welcome-card">
          <span className="badge">Unaudited local prototype</span>
          <h2>Name this device</h2>
          <p>
            LockTalk registers each browser or device separately. Choose a name
            you will recognize in your device list, such as “My laptop”.
          </p>

          <form className="registration-form" onSubmit={handleRegisterDevice}>
            <label htmlFor="pending-user-id">Public user ID</label>
            <input id="pending-user-id" value={pendingLogin.userId} readOnly />

            <label htmlFor="pending-device-name">Device name</label>
            <input
              id="pending-device-name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              maxLength={100}
              autoComplete="off"
              required
            />

            <div className="button-row">
              <button type="submit" disabled={busy}>
                {busy ? "Registering..." : "Register this device"}
              </button>
              <button type="button" onClick={cancelPending} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>

          {message && (
            <p className="registration-notice" role="status">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="content">
      <div className="welcome-card">
        <span className="badge">Unaudited local prototype</span>
        <h2>Login</h2>
        <p>Enter your display name or public user ID, and your account key.</p>

        <form className="registration-form" onSubmit={handleSubmit}>
          <label htmlFor="login-display-name">Display name or public user ID</label>
          <input
            id="login-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
            autoComplete="off"
            required
          />

          <label htmlFor="login-account-key">Account key</label>
          <div className="login-key-field">
            <input
              id="login-account-key"
              type={showKey ? "text" : "password"}
              value={accountKey}
              onChange={(event) => setAccountKey(event.target.value)}
              autoComplete="off"
              required
            />

            <button
              type="button"
              className="login-key-toggle"
              onClick={() => setShowKey((current) => !current)}
              aria-pressed={showKey}
            >
              {showKey ? "Hide" : "Reveal"}
            </button>
          </div>

          <button type="submit" disabled={busy}>
            {busy ? "Logging in..." : "Login"}
          </button>
        </form>

        {message && (
          <p className="registration-notice" role="status">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
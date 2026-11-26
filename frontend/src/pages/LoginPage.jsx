import { useEffect, useState } from "react";
import { login } from "../services/accounts.js";
import { getDevice } from "../services/deviceStorage.js";
import {
  DeviceApiError,
  deviceCryptoAvailable,
  loginReturningDevice,
  registerNewDevice,
} from "../services/devices.js";
import "../styles/registration.css";

const USER_ID_PATTERN = /^[0-9a-f]{32}$/;

export default function LoginPage({ onLogin }) {
  const [userId, setUserId] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [knownDevice, setKnownDevice] = useState(null);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const trimmedUserId = userId.trim();
  const userIdLooksValid = USER_ID_PATTERN.test(trimmedUserId);

  // Check whether this browser already holds a device key for the entered ID.
  useEffect(() => {
    if (!userIdLooksValid) {
      setKnownDevice(null);
      return;
    }

    let cancelled = false;

    getDevice(trimmedUserId)
      .then((device) => {
        if (!cancelled) setKnownDevice(device);
      })
      .catch(() => {
        if (!cancelled) setKnownDevice(null);
      });

    return () => {
      cancelled = true;
    };
  }, [trimmedUserId, userIdLooksValid]);

  function describeError(error) {
    if (error instanceof DeviceApiError) return error.message;
    if (error instanceof TypeError) {
      return "Could not reach the backend. Is starter.js running?";
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

    const id = trimmedUserId;
    const name = deviceName.trim();

    setBusy(true);
    setMessage("");

    try {
      const account = await login(id, accountKey.trim());
      setAccountKey("");

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

      if (name) {
        await finishAsNewDevice(ticket, id, name);
        return;
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
        <p>Enter your public user ID and account key.</p>

        <form className="registration-form" onSubmit={handleSubmit}>
          <label htmlFor="login-user-id">Public user ID</label>
          <input
            id="login-user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
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

          <button type="button" onClick={() => setShowKey(!showKey)}>
            {showKey ? "Hide key" : "Reveal key"}
          </button>

          {userIdLooksValid && knownDevice && (
            <p className="device-hint">
              This browser holds a device key for this account:{" "}
              <strong>{knownDevice.deviceName}</strong>
            </p>
          )}

          {userIdLooksValid && !knownDevice && (
            <>
              <label htmlFor="login-device-name">
                Device name (new device in this browser)
              </label>
              <input
                id="login-device-name"
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </>
          )}

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
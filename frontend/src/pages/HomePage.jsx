import { useState } from "react";
import { registerAccount } from "../services/accounts.js";
import "../styles/registration.css";

function generateAccountKey() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export default function HomePage() {
  const [displayName, setDisplayName] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function prepareKey(event) {
    event.preventDefault();

    if (!displayName.trim()) {
      setNotice("Please enter a display name.");
      return;
    }

    try {
      setAccountKey(generateAccountKey());
      setConfirmed(false);
      setNotice("");
    } catch {
      setNotice("Could not generate an account key in this browser.");
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(accountKey);
      setNotice("Key copied. Store it somewhere safe.");
    } catch {
      setNotice("Copy failed. Reveal the key and copy it manually.");
    }
  }
    
    async function copyUserId() {
        try {
            await navigator.clipboard.writeText(account.user_id);
            setNotice("Public user ID copied.");
        } catch {
            setNotice("Copy failed. Please copy the public user ID manually.");
        }
    }

  async function createAccount() {
    if (!confirmed || busy) return;

    setBusy(true);
    setNotice("");

    try {
      const result = await registerAccount(displayName.trim(), accountKey);
      setAccount(result);
    } catch {
      setNotice(
        "Registration could not be confirmed. Keep your key: the request " +
          "may have reached the server. Try logging in before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setDisplayName("");
    setAccountKey("");
    setShowKey(false);
    setConfirmed(false);
    setAccount(null);
    setNotice("");
  }

  return (
    <main className="content">
      <div className="welcome-card">
        <span className="badge">Unaudited local prototype</span>
        <h2>Welcome to LockTalk</h2>
        <p>
          Create a test account. Messages are stored as plaintext and are not
          end-to-end encrypted. Do not use sensitive information.
        </p>

        {!accountKey && !account && (
          <form onSubmit={prepareKey} className="registration-form">
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={100}
              required
            />
            <button type="submit">Generate account key</button>
          </form>
        )}

        {accountKey && !account && (
          <section className="registration-form">
            <h3>Save your account key</h3>
            <p className="warning">
              This key cannot be recovered. Anyone who has it may access your
              account. Save it before continuing.
            </p>

            <label htmlFor="account-key">Account key</label>
            <input
              id="account-key"
              type={showKey ? "text" : "password"}
              value={accountKey}
              readOnly
              autoComplete="off"
            />

            <div className="button-row">
              <button type="button" onClick={() => setShowKey(!showKey)}>
                {showKey ? "Hide key" : "Reveal key"}
              </button>
              <button type="button" onClick={copyKey}>
                Copy key
              </button>
            </div>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I have saved my account key.
            </label>

            <button
              type="button"
              onClick={createAccount}
              disabled={!confirmed || busy}
            >
              {busy ? "Creating account..." : "Create account"}
            </button>
          </section>
        )}

        {account && (
          <section className="registration-form">
            <h3>Account created</h3>
            <p>
              Save this public user ID too. Other users need it to find you.
              Use your display name and account key to log in.
            </p>
            <label htmlFor="user-id">Public user ID</label>
            <input id="user-id" value={account.user_id} readOnly />
            <button type="button" onClick={copyUserId}>
                Copy public user ID
            </button>
            <p className="warning">
              Closing this screen removes the key from view. LockTalk cannot
              recover it.
            </p>
            <button type="button" onClick={startOver}>
              Done
            </button>
          </section>
        )}

        {notice && (
          <p className="registration-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </main>
  );
}
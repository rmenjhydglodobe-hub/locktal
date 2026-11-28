import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Eye, EyeOff, KeyRound, LoaderCircle, UserPlus } from "lucide-react";
import { registerAccount } from "../services/accounts.js";
import Icon from "../components/Icon.jsx";
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
    } catch (error) {
      if (error instanceof TypeError) {
        setNotice(
          "Could not reach the backend. Keep your key: the request may not " +
            "have reached the server. Check that LockTalk is running, then retry.",
        );
      } else {
        setNotice(
          (error?.message || "Registration failed.") +
            " Keep your key. If you are not sure whether the account was " +
            "created, try logging in before retrying.",
        );
      }
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
        <span className="badge"><Icon icon={UserPlus} size={14} /> Create account</span>
        <h2>Get started</h2>
        <p>
          Create a local test account. Messages are stored as plaintext and are not
          end-to-end encrypted yet.
        </p>

        {!accountKey && !account && (
          <form onSubmit={prepareKey} className="registration-form">
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={100}
              placeholder="How others will see you"
              required
            />
            <button type="submit"><Icon icon={KeyRound} size={16} /> Generate account key</button>
          </form>
        )}

        {accountKey && !account && (
          <section className="registration-form">
            <h3>Save your account key</h3>
            <p className="warning">
              <Icon icon={AlertTriangle} size={15} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
              This key cannot be recovered. Anyone who has it may access your account.
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
              <button type="button" className="secondary" onClick={() => setShowKey(!showKey)}>
                <Icon icon={showKey ? EyeOff : Eye} size={16} /> {showKey ? "Hide key" : "Reveal key"}
              </button>
              <button type="button" className="secondary" onClick={copyKey}>
                <Icon icon={Copy} size={16} /> Copy key
              </button>
            </div>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I have saved my account key somewhere safe.
            </label>

            <button
              type="button"
              onClick={createAccount}
              disabled={!confirmed || busy}
            >
              {busy ? <><Icon icon={LoaderCircle} size={16} className="spin" /> Creating account...</> : <><Icon icon={UserPlus} size={16} /> Create account</>}
            </button>
          </section>
        )}

        {account && (
          <section className="registration-form">
            <h3><Icon icon={CheckCircle2} size={18} style={{ verticalAlign: "text-bottom", color: "var(--color-accent, #16a34a)" }} /> Account created</h3>
            <p>
              Save this public user ID. Other users need it to find you. Use your
              display name and account key to log in.
            </p>
            <label htmlFor="user-id">Public user ID</label>
            <input id="user-id" value={account.user_id} readOnly />
            <button type="button" className="secondary" onClick={copyUserId}>
              <Icon icon={Copy} size={16} /> Copy public user ID
            </button>
            <p className="warning">
              Closing this screen removes the key from view. LockTalk cannot recover it.
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
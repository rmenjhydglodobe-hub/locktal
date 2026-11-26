import { useCallback, useEffect, useState } from "react";

import AuthLayout from "./components/AuthLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import { getCurrentSession, logout } from "./services/accounts.js";

const SESSION_KEY = "locktalk_session_token";

const THEME_KEY = "locktalk_theme";

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default function App() {
  const [page, setPage] = useState("register");
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [ logoutError, setLogoutError ] = useState("");
  const [theme, setTheme] = useState(loadTheme);

  const checkSession = useCallback(async () => {
    setChecking(true);
    setCheckError("");

    const token = sessionStorage.getItem(SESSION_KEY);

    if (!token) {
      setChecking(false);
      return;
    }

    try {
      const currentAccount = await getCurrentSession(token);

      if (currentAccount) {
        setAccount(currentAccount);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        setAccount(null);
        setPage("login");
      }
    } catch {
      // Keep the token so a temporary connection failure can be retried.
      setCheckError("Could not reach the backend to check your session.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
      checkSession();
    }, [checkSession]);

    function handleLogin(result) {
      sessionStorage.setItem(SESSION_KEY, result.session_token);

      setAccount({
        user_id: result.user_id,
        display_name: result.display_name,
      });

      setLogoutError("");
    }

    function handleCurrentDeviceRevoked() {
      sessionStorage.removeItem(SESSION_KEY);
      setAccount(null);
      setPage("login");
    }

    async function handleLogout() {
      const token = sessionStorage.getItem(SESSION_KEY);

      setLogoutBusy(true);
      setLogoutError("");

      try {
        if (token) {
          await logout(token);
        }

        sessionStorage.removeItem(SESSION_KEY);
        setAccount(null);
        setPage("login");
      } catch {
        setLogoutError(
          "Could not contact the server. Please try logging out again.",
        );
      } finally {
        setLogoutBusy(false);
      }
    }

    // Keep other open tabs on the same browser in sync.
  useEffect(() => {
    function handleStorage(event) {
      if (event.key === THEME_KEY || event.key === null) {
        setTheme(event.newValue === "dark" ? "dark" : "light");
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function changeTheme(value) {
    const nextTheme = value === "dark" ? "dark" : "light";

    setTheme(nextTheme);

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // The theme still applies in this tab for the current visit.
    }
  }

  return (
    <div className="app">
      <div className="page-area">
        {checking ? (
          <main className="content">
            <p>Checking session...</p>
          </main>
        ) : checkError ? (
          <main className="content">
            <div className="welcome-card registration-form">
              <p role="alert">{checkError}</p>

              <button type="button" onClick={checkSession}>
                Retry
              </button>
            </div>
          </main>
        ) : account ? (
          <DashboardPage
            account={account}
            sessionToken={sessionStorage.getItem(SESSION_KEY)}
            onLogout={handleLogout}
            onCurrentDeviceRevoked={handleCurrentDeviceRevoked}
            busy={logoutBusy}
            message={logoutError}
            theme={theme}
            onThemeChange={changeTheme}
          />
        ) : (
          <AuthLayout theme={theme} onThemeChange={changeTheme}>
            <div className="page-switcher">
              <button
                type="button"
                className={page === "login" ? "active" : ""}
                aria-pressed={page === "login"}
                onClick={() => setPage("login")}
              >
                Login
              </button>

              <button
                type="button"
                className={page === "register" ? "active" : ""}
                aria-pressed={page === "register"}
                onClick={() => setPage("register")}
              >
                Register
              </button>
            </div>

            {page === "register" ? (
              <HomePage />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )}
          </AuthLayout>
        )}
      </div>
    </div>
  );
}
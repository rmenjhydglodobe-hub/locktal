import { useState } from "react";

import "../styles/registration.css";
import "../styles/workspace.css";

import Sidebar from "../components/Sidebar.jsx";
import DeviceManager from "../components/DeviceManager.jsx";
import NotificationList from "../components/NotificationList.jsx";
import UserSearch from "../components/UserSearch.jsx";
import IncomingRequests from "../components/IncomingRequests.jsx";
import ContactsList from "../components/ContactsList.jsx";
import BlockedUsers from "../components/BlockedUsers.jsx";
import DirectChat from "../components/DirectChat.jsx";

const SECTION_TITLES = {
  chats: "Chats",
  contacts: "Contacts",
  groups: "Groups",
  notifications: "Notifications",
  settings: "Settings",
};

export default function DashboardPage({
  account,
  sessionToken,
  onLogout,
  onCurrentDeviceRevoked,
  busy,
  message,
  theme,
  onThemeChange,
}) {
  const [ section, setSection ] = useState("chats");
  const [selectedContact, setSelectedContact] = useState(null);
  const [requestRefreshKey, setRequestRefreshKey] = useState(0);
  const [copyNote, setCopyNote] = useState("");

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(account.user_id);
      setCopyNote("Public user ID copied.");
    } catch {
      setCopyNote("Copy failed. Please copy it manually.");
    }
  }

  return (
    <div className="workspace" data-theme={theme}>
      <Sidebar
        section={section}
        onSelect={setSection}
        theme={theme}
        onThemeChange={onThemeChange}
        account={account}
        onLogout={onLogout}
        logoutBusy={busy}
      />

      <div className="ws-main">
        <header className="ws-header">
          <h2>{SECTION_TITLES[section]}</h2>
          <span className="ws-pill">Unaudited prototype</span>
        </header>

        {message && (
          <p className="ws-banner" role="status">
            {message}
          </p>
        )}

        <div className="ws-body">
          {section === "chats" &&
            (selectedContact ? (
              <DirectChat
                key={selectedContact.user_id}
                account={account}
                contact={selectedContact}
                sessionToken={sessionToken}
                onChooseContact={() => setSection("contacts")}
              />
            ) : (
              <div className="ws-empty">
                <div className="ws-empty-icon" aria-hidden="true">
                  🔒
                </div>
                <h3>No conversation selected</h3>
                <p>
                  Choose an accepted contact to open a chat preview. Messaging and
                  encryption are not implemented yet.
                </p>

                <div className="ws-quick-actions">
                  <button type="button" onClick={() => setSection("contacts")}>
                    Go to contacts
                  </button>
                </div>
              </div>
            ))}

          {section === "contacts" && (
            <div className="ws-section">
              <UserSearch
                sessionToken={sessionToken}
                onRequestChanged={() =>
                  setRequestRefreshKey((current) => current + 1)
                }
              />
              <IncomingRequests
                sessionToken={sessionToken}
                refreshKey={requestRefreshKey}
                onAccepted={() => setRequestRefreshKey((current) => current + 1)}
              />

              <ContactsList
                sessionToken={sessionToken}
                refreshKey={requestRefreshKey}
                onChanged={() => setRequestRefreshKey((current) => current + 1)}
                onOpenChat={(contact) => {
                  setSelectedContact(contact);
                  setSection("chats");
                }}
              />

              <BlockedUsers
                sessionToken={sessionToken}
                refreshKey={requestRefreshKey}
                onChanged={() => setRequestRefreshKey((current) => current + 1)}
              />
            </div>
          )}

          {section === "groups" && (
            <div className="ws-section">
              <div className="ws-card">
                <h3>Groups are not available yet</h3>
                <p>
                  Group creation, invitations, and admin voting will be added
                  in a later step.
                </p>
              </div>
            </div>
          )}

          {section === "notifications" && (
            <div className="ws-section">
              <NotificationList sessionToken={sessionToken} />
            </div>
          )}

          {section === "settings" && (
            <div className="ws-section">
              <section>
                <h3>Your account</h3>
                <div className="registration-form">
                  <label htmlFor="settings-user-id">Public user ID</label>
                  <input
                    id="settings-user-id"
                    value={account.user_id}
                    readOnly
                  />
                  <button type="button" onClick={copyUserId}>
                    Copy public user ID
                  </button>
                  {copyNote && <p role="status">{copyNote}</p>}
                </div>
              </section>

              <DeviceManager
                sessionToken={sessionToken}
                onCurrentDeviceRevoked={onCurrentDeviceRevoked}
              />
            </div>
          )}
        </div>
      </div>

      <aside className="ws-aside" aria-label="Details">
        <div className="ws-card centered">
          <h3>No active conversation</h3>
          <p>Conversations will appear here once messaging is built.</p>
        </div>

        <div className="ws-card">
          <h3>Your account</h3>
          <p>{account.display_name}</p>
          <p className="ws-id">{account.user_id}</p>
          <button type="button" onClick={copyUserId}>
            Copy public user ID
          </button>
          {copyNote && <p role="status">{copyNote}</p>}
        </div>

        <div className="ws-card">
          <p>
            Local prototype. Messages are not encrypted yet. Do not use
            sensitive information.
          </p>
        </div>
      </aside>
    </div>
  );
}
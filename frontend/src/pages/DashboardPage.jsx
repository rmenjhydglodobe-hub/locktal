import { useState } from "react";
import { Copy, Info, MessageSquare, ShieldAlert, Users } from "lucide-react";

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
import ChatHistory from "../components/ChatHistory.jsx";
import GroupManager from "../components/GroupManager.jsx";
import Icon from "../components/Icon.jsx";

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
  const [section, setSection] = useState("chats");
  const [selectedContact, setSelectedContact] = useState(null);
  const [requestRefreshKey, setRequestRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [copyNote, setCopyNote] = useState("");

  function openChat(contact) {
    setSelectedContact(contact);
    setSection("chats");
    setHistoryRefreshKey((current) => current + 1);
  }

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
            <Icon icon={Info} size={16} />
            {message}
          </p>
        )}

        <div className="ws-body" key={section}>
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
              <div className="ws-section">
                <div className="ws-empty" style={{ minHeight: 220 }}>
                  <div className="ws-empty-icon">
                    <Icon icon={MessageSquare} size={34} strokeWidth={1.5} />
                  </div>
                  <h3>Chat history</h3>
                  <p>
                    Select a previous chat below. For safety, you’ll confirm the
                    contact’s public user ID before reopening it.
                  </p>
                </div>
                <ChatHistory
                  sessionToken={sessionToken}
                  refreshKey={historyRefreshKey}
                  onOpenChat={openChat}
                />
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
                onOpenChat={openChat}
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
              <GroupManager sessionToken={sessionToken} account={account} />
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
          <div className="ws-card-icon"><Icon icon={MessageSquare} size={22} /></div>
          <h3>{selectedContact ? selectedContact.display_name : "No active conversation"}</h3>
          <p>
            {selectedContact
              ? "You have an active chat selected."
              : "Select a contact to start chatting."}
          </p>
        </div>

        <div className="ws-card">
          <h3>Your account</h3>
          <p>{account.display_name}</p>
          <p className="ws-id">{account.user_id}</p>
          <button type="button" onClick={copyUserId}>
            <Icon icon={Copy} size={15} /> Copy public user ID
          </button>
          {copyNote && <p role="status">{copyNote}</p>}
        </div>

        <div className="ws-card">
          <h3><Icon icon={ShieldAlert} size={16} style={{ verticalAlign: "text-bottom" }} /> Prototype notice</h3>
          <p>
            Local prototype. Messages are not end-to-end encrypted yet. Do not use
            sensitive information.
          </p>
        </div>
      </aside>
    </div>
  );
}
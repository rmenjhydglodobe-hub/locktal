import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Send, UserPlus, Users, LogOut } from "lucide-react";
import {
  addGroupMember,
  createGroup,
  leaveGroup,
  listGroupMembers,
  listGroupMessages,
  listGroups,
  sendGroupMessage,
} from "../services/groups.js";
import Icon from "./Icon.jsx";
import MessageText from "./MessageText.jsx";

export default function GroupManager({ sessionToken, account }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [memberId, setMemberId] = useState("");
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  async function loadGroups() {
    setLoading(true);
    setError("");
    try {
      const result = await listGroups(sessionToken);
      setGroups(result.groups || []);
    } catch (err) {
      setError(err.message || "Could not load groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, [sessionToken]);

  async function openGroup(group) {
    setActiveGroup(group);
    setChatLoading(true);
    setChatError("");
    try {
      const [membersResult, messagesResult] = await Promise.all([
        listGroupMembers(sessionToken, group.group_id),
        listGroupMessages(sessionToken, group.group_id),
      ]);
      setMembers(membersResult.members || []);
      setMessages(messagesResult.messages || []);
    } catch (err) {
      setChatError(err.message || "Could not load group.");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (busy) return;
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await createGroup(sessionToken, name);
      setNewName("");
      await loadGroups();
    } catch (err) {
      setError(err.message || "Could not create group.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember(event) {
    event.preventDefault();
    if (!activeGroup || busy) return;
    const value = memberId.trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(value)) {
      setChatError("Enter a full 32-character public user ID.");
      return;
    }
    setBusy(true);
    setChatError("");
    try {
      await addGroupMember(sessionToken, activeGroup.group_id, value);
      setMemberId("");
      await openGroup(activeGroup);
      await loadGroups();
    } catch (err) {
      setChatError(err.message || "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (!activeGroup || busy) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setChatError("");
    try {
      await sendGroupMessage(sessionToken, activeGroup.group_id, body);
      setDraft("");
      const result = await listGroupMessages(sessionToken, activeGroup.group_id);
      setMessages(result.messages || []);
    } catch (err) {
      setChatError(err.message || "Could not send group message.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!activeGroup || busy) return;
    const confirmed = window.confirm(
      activeGroup.role === "owner"
        ? `Leave and delete "${activeGroup.name}"? This removes the group for everyone.`
        : `Leave "${activeGroup.name}"?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setChatError("");
    try {
      await leaveGroup(sessionToken, activeGroup.group_id);
      setActiveGroup(null);
      setMembers([]);
      setMessages([]);
      await loadGroups();
    } catch (err) {
      setChatError(err.message || "Could not leave group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contacts-list">
      <div className="section-header">
        <span className="section-icon"><Icon icon={Users} size={18} /></span>
        <h3>Groups</h3>
      </div>

      <form className="registration-form" onSubmit={handleCreate}>
        <label htmlFor="group-name">New group name</label>
        <div className="button-row">
          <input
            id="group-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Project team"
          />
          <button type="submit" disabled={busy || !newName.trim()}>
            {busy ? <Icon icon={LoaderCircle} size={15} className="spin" /> : <Icon icon={Plus} size={15} />} Create
          </button>
        </div>
      </form>

      {loading && <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading groups...</p>}
      {error && <p className="registration-notice" role="alert">{error}</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon icon={Users} size={24} /></div>
          <p>No groups yet. Create one to get started.</p>
        </div>
      )}

      {!loading && groups.map((group) => (
        <div className="user-result" key={group.group_id}>
          <div className="contact-header">
            <strong>{group.name}</strong>
            <span className="status-pill active">{group.role}</span>
          </div>
          <small>{group.member_count} member{group.member_count === 1 ? "" : "s"}</small>
          <div className="button-row">
            <button type="button" className="secondary" onClick={() => openGroup(group)}>Open</button>
          </div>
        </div>
      ))}

      {activeGroup && (
        <div className="user-result" style={{ gap: 12 }}>
          <div className="contact-header">
            <strong>{activeGroup.name}</strong>
            <span className="status-pill active">{activeGroup.role}</span>
          </div>

          {chatLoading ? (
            <p><Icon icon={LoaderCircle} size={15} className="spin" /> Loading group...</p>
          ) : (
            <>
              <div>
                <small>Members</small>
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {members.map((member) => (
                    <small key={member.user_id}>
                      {member.display_name} ({member.role}) — {member.user_id}
                    </small>
                  ))}
                </div>
              </div>

              {activeGroup.role === "owner" && (
                <form className="registration-form" onSubmit={handleAddMember}>
                  <label htmlFor="group-member-id">Add member by public user ID</label>
                  <div className="button-row">
                    <input
                      id="group-member-id"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      placeholder="32-character user ID"
                      autoComplete="off"
                    />
                    <button type="submit" disabled={busy || !memberId.trim()}>
                      <Icon icon={UserPlus} size={15} /> Add
                    </button>
                  </div>
                </form>
              )}

              <div className="direct-chat-messages" aria-label="Group messages" style={{ minHeight: 180 }}>
                {messages.length === 0 && <p className="device-hint">No messages yet.</p>}
                {messages.map((item) => {
                  const mine = item.sender_user_id === account.user_id;
                  return (
                    <article className={`direct-message ${mine ? "mine" : "theirs"}`} key={item.message_id}>
                      <strong>{mine ? "You" : item.sender_display_name}</strong>
                      <p><MessageText text={item.body} /></p>
                      <small>{item.created_at || "Unknown time"}</small>
                    </article>
                  );
                })}
              </div>

              <form className="direct-chat-composer" onSubmit={handleSend}>
                <label htmlFor="group-message">Group message</label>
                <div className="direct-chat-composer-row">
                  <textarea
                    id="group-message"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={4000}
                    rows={2}
                    placeholder="Type a group message..."
                    disabled={busy}
                  />
                  <button type="submit" disabled={busy || !draft.trim()}>
                    <Icon icon={Send} size={15} /> Send
                  </button>
                </div>
              </form>

              <div className="button-row">
                <button type="button" className="secondary" onClick={handleLeave} disabled={busy}>
                  <Icon icon={LogOut} size={15} /> {activeGroup.role === "owner" ? "Leave/delete group" : "Leave group"}
                </button>
              </div>
            </>
          )}

          {chatError && <p className="registration-notice" role="alert">{chatError}</p>}
        </div>
      )}
    </section>
  );
}

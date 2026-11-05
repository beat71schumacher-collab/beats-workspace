/* ==========================================================================
   Beats Workspace — Application logic
   Ties together data, storage, and UI. Implements local interactions:
   channels, direct messages, messages, threads, reactions, file attachments,
   search, notes, and a simulated huddle (phone call) interface.

   NOTE: Audio/video calling and real file storage are mocked/simulated for
   this local demo and are clearly labeled as such.
   ========================================================================== */

const APP = (function () {
  let state = null; // full app state from storage
  let currentView = "home"; // home | channels | messages | calls | files | notes
  let selectedConv = null; // { id, type, name, topic, createdBy, members, createdAt, avatar, color }
  let openThreadRoot = null; // message id when viewing a thread
  let searchTerm = "";

  // ---------- Init ----------

  function init() {
    state = storage.load();
    ensureCurrentUser();

    // Bind UI -> app callbacks
    bindSearch();
    bindComposer();
    bindGlobalActions();

    // Render initial
    render();
  }

  function ensureCurrentUser() {
    if (!state.users.find((u) => u.id === CURRENT_USER_ID)) {
      state.users.push({
        id: CURRENT_USER_ID,
        name: "You",
        email: "you@beatswork.example",
        role: "member",
        status: "online",
        avatar: null,
        color: "#7B2CBF",
      });
      storage.save(state);
    }
  }

  // ---------- State helpers ----------

  function getConv(id, type) {
    if (type === "channel") return state.channels.find((c) => c.id === id);
    if (type === "dm") return state.dms.find((d) => d.id === id);
    return null;
  }

  function getMessagesForConv(conv) {
    const msgs = [];
    state.messages.forEach((m) => {
      if (conv.type === "channel" && m.channelId === conv.id && !m.threadRootId) msgs.push(m);
      if (conv.type === "dm" && m.dmId === conv.id && !m.threadRootId) msgs.push(m);
    });
    if (openThreadRoot) {
      const threadMsgs = state.messages.filter(
        (m) => m.threadRootId === openThreadRoot
      );
      const replies = state.threads.filter((t) => t.threadRootId === openThreadRoot);
      const all = [...threadMsgs, ...replies];
      all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return all;
    }
    msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return msgs;
  }

  function getFilesForConv(conv) {
    return state.files.filter(
      (f) => (conv.type === "channel" ? f.channelId === conv.id : f.dmId === conv.id)
    );
  }

  function userColor(id) {
    const u = state.users.find((u) => u.id === id);
    return u ? u.color : "#94A3B8";
  }

  // ---------- Rendering ----------

  function render() {
    const users = state.users;
    const E = UI.els;

    // Sidebar
    UI.renderSidebar(users, CURRENT_USER_ID);
    UI.setActiveNav(currentView);

    if (currentView === "home") {
      E.listView.style.display = "flex";
      E.convView.style.display = "none";
      E.listTitle.textContent = "Kanäle";
      UI.renderList(state.channels, {
        type: "channel",
        selectedId: null,
        onItemClick: (c) => openConversation(c),
        searchTerm,
      });
    } else if (currentView === "channels") {
      E.listView.style.display = "flex";
      E.convView.style.display = "none";
      E.listTitle.textContent = "Kanäle";
      UI.renderList(state.channels, {
        type: "channel",
        selectedId: selectedConv && selectedConv.type === "channel" ? selectedConv.id : null,
        onItemClick: (c) => openConversation(c),
        searchTerm,
      });
    } else if (currentView === "messages") {
      E.listView.style.display = "flex";
      E.convView.style.display = "none";
      E.listTitle.textContent = "Direktnachrichten";
      const dms = state.dms.map((d) => ({
        ...d,
        name: d.name,
        color: userColor(d.members.find((m) => m !== CURRENT_USER_ID) || d.members[0]),
      }));
      UI.renderList(dms, {
        type: "dm",
        selectedId: selectedConv && selectedConv.type === "dm" ? selectedConv.id : null,
        onItemClick: (d) => openConversation(d),
        searchTerm,
      });
    } else if (currentView === "calls") {
      renderCallsList();
    } else if (currentView === "files") {
      renderFilesList();
    } else if (currentView === "notes") {
      renderNotesList();
    }

    // Conversation view
    if (selectedConv) {
      E.convView.style.display = "flex";
      E.listView.style.display = "none";
      UI.renderConvHeader(selectedConv, users);
      const tab = openThreadRoot ? "chat" : (selectedConv._activeTab || "chat");
      UI.setConvTabs(tab);
      const msgs = getMessagesForConv(selectedConv);
      UI.renderMessages(msgs, users, CURRENT_USER_ID, onReply, onToggleReaction, onOpenThread);
      UI.showThreadBanner(!!openThreadRoot, selectedConv.name || selectedConv.title);
      UI.setThreadTypingPlaceholder(openThreadRoot ? "Antwort schreiben..." : "Nachricht schreiben...");
      UI.renderFiles(getFilesForConv(selectedConv), selectedConv.id, selectedConv.type);
      UI.renderNotes(selectedConv.id, state.notes);
      UI.setComposerEnabled(true);

      // Huddle
      const huddle = state.huddles && state.huddles[selectedConv.id];
      UI.setHuddleActive(!!huddle);
      if (huddle) {
        UI.renderHuddleParticipants(huddle.participants, users, CURRENT_USER_ID);
        E.huddleStatusText.textContent = "Huddle active";
      }
    } else {
      E.convView.style.display = "none";
    }
  }

  function renderCallsList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Anrufe";
    const items = [
      {
        id: "call-huddle",
        name: "Anruf starten",
        sub: "Audio huddle with teammates (simulated)",
        color: "#7B2CBF",
      },
    ];
    UI.renderList(items, {
      type: "channel",
      selectedId: null,
      onItemClick: () => {
        if (selectedConv) startHuddle(selectedConv.id);
        else UI.toast("Open a conversation first, then start a huddle.");
      },
      searchTerm: "",
    });
    // Add a hint
    E.listItems.insertAdjacentHTML(
      "beforeend",
      `<li class="list-item" style="pointer-events:none;opacity:0.6;">
         <div class="item-body">
           <div class="item-name">Anrufe gibt es pro Unterhaltung.</div>
           <div class="item-sub">Öffne einen Kanal oder eine Direktnachricht und wechsle zum Tab «Anruf».</div>
         </div>
       </li>`
    );
  }

  function renderFilesList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Alle Dateien";
    const files = [...state.files].sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );
    E.listItems.innerHTML = "";
    if (files.length === 0) {
      E.listEmpty.style.display = "block";
      E.listItems.style.display = "none";
      return;
    }
    E.listEmpty.style.display = "none";
    E.listItems.style.display = "block";
    files.forEach((f) => {
      const conv = getConv(f.channelId || f.dmId, f.channelId ? "channel" : "dm");
      const li = document.createElement("li");
      li.className = "list-item";
      const icon = f.type === "pdf" ? "📄" : f.type === "fig" ? "🎨" : f.type === "yaml" ? "📜" : "📎";
      li.innerHTML = `
        <div class="item-avatar">${icon}</div>
        <div class="item-body">
          <div class="item-name" title="${UI.escapeHtml(f.name)}">${UI.escapeHtml(f.name)}</div>
          <div class="item-sub">#${conv ? conv.name : "unknown"} • ${UI.formatRelative(f.uploadedAt)}</div>
        </div>
        <div class="item-count">${UI.escapeHtml(f.size)}</div>
      `;
      E.listItems.appendChild(li);
    });
  }

  function renderNotesList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Notizen";
    const items = [...state.channels, ...state.dms].filter((c) => state.notes[c.id]);
    E.listItems.innerHTML = "";
    if (items.length === 0) {
      E.listEmpty.style.display = "block";
      E.listItems.style.display = "none";
      return;
    }
    E.listEmpty.style.display = "none";
    E.listItems.style.display = "block";
    items.forEach((c) => {
      const li = document.createElement("li");
      li.className = "list-item";
      li.innerHTML = `
        <div class="item-avatar" style="background:${userColor(c.createdBy || c.members?.[0])}">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;display:block;margin:auto;">
            <text x="12" y="15" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">📝</text>
          </svg>
        </div>
        <div class="item-body">
          <div class="item-name">${UI.escapeHtml(c.name || c.title)}</div>
          <div class="item-sub">Gemeinsame Notizen</div>
        </div>
      `;
      li.addEventListener("click", () => {
        currentView = "home";
        openConversation(c);
      });
      E.listItems.appendChild(li);
    });
  }

  // ---------- Conversation actions ----------

  function openConversation(conv) {
    selectedConv = conv;
    openThreadRoot = null;
    conv._activeTab = conv._activeTab || "chat";
    render();
  }

  function onReply(text) {
    if (!selectedConv) return;
    if (!text || !text.trim()) return;
    const msg = {
      id: "msg_" + Date.now(),
      text: text.trim(),
      authorId: CURRENT_USER_ID,
      createdAt: new Date().toISOString(),
      reactions: [],
      replyCount: 0,
      threadRootId: openThreadRoot || null,
    };
    if (selectedConv.type === "channel") msg.channelId = selectedConv.id;
    if (selectedConv.type === "dm") msg.dmId = selectedConv.id;
    if (openThreadRoot) msg.threadRootId = openThreadRoot;

    state.messages.push(msg);
    if (openThreadRoot) {
      const root = state.messages.find((m) => m.id === openThreadRoot);
      if (root) root.replyCount = (root.replyCount || 0) + 1;
    }
    storage.save(state);
    UI.appendMessage(msg, state.users, CURRENT_USER_ID, onToggleReaction, onOpenThread);
    UI.clearMessageInput();
    render();
  }

  function onToggleReaction(msgId, emoji) {
    const msg = state.messages.find((m) => m.id === msgId) || state.threads.find((t) => t.id === msgId);
    if (!msg) return;
    msg.reactions = msg.reactions || [];
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.users.includes(CURRENT_USER_ID)) {
        existing.users = existing.users.filter((u) => u !== CURRENT_USER_ID);
        if (existing.users.length === 0) {
          msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        existing.users.push(CURRENT_USER_ID);
      }
    } else {
      msg.reactions.push({ emoji, users: [CURRENT_USER_ID] });
    }
    storage.save(state);
    render();
  }

  function onOpenThread(rootMsg) {
    openThreadRoot = rootMsg.id;
    selectedConv._activeTab = "chat";
    render();
  }

  function closeThread() {
    openThreadRoot = null;
    render();
  }

  // ---------- Creation ----------

  function createChannel(name, topic) {
    if (!name || !name.trim()) return;
    const id = "c_" + Date.now();
    const channel = {
      id,
      name: name.trim(),
      type: "channel",
      topic: topic || "",
      createdBy: CURRENT_USER_ID,
      createdAt: new Date().toISOString(),
      members: [CURRENT_USER_ID],
    };
    state.channels.push(channel);
    state.notes[id] = "# Notes for " + name.trim() + "\n\n";
    storage.save(state);
    UI.toast(`Channel "${name.trim()}" created`);
    openConversation(channel);
    render();
  }

  function createDM(userId) {
    if (!userId || userId === CURRENT_USER_ID) return;
    const existing = state.dms.find(
      (d) => d.members.includes(CURRENT_USER_ID) && d.members.includes(userId)
    );
    if (existing) {
      openConversation(existing);
      render();
      return;
    }
    const user = state.users.find((u) => u.id === userId);
    const dm = {
      id: "dm_" + Date.now(),
      type: "dm",
      name: user ? user.name : "User",
      members: [CURRENT_USER_ID, userId],
      createdAt: new Date().toISOString(),
    };
    state.dms.push(dm);
    state.notes[dm.id] = "# Notes\n\n";
    storage.save(state);
    UI.toast(`Message started with ${dm.name}`);
    openConversation(dm);
    render();
  }

  // ---------- Search ----------

  function bindSearch() {
    const E = UI.els;
    E.searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value;
      render();
    });
    E.btnClearSearch.addEventListener("click", () => {
      E.searchInput.value = "";
      searchTerm = "";
      render();
    });
  }

  // ---------- Composer ----------

  function bindComposer() {
    const E = UI.els;
    E.messageInput.addEventListener("input", UI.autoResizeTextarea);
    E.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = UI.getMessageInput();
        onReply(text);
      }
    });
    E.btnSend.addEventListener("click", () => {
      const text = UI.getMessageInput();
      onReply(text);
    });

    // Attach file (composer)
    E.btnAttach.addEventListener("click", () => {
      E.filePicker.value = "";
      E.filePicker.click();
    });
    E.filePicker.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      files.forEach((f) => addFileAttachment(f, selectedConv));
      E.filePicker.value = "";
    });

    // Attach file (files panel)
    E.btnUploadFile.addEventListener("click", () => {
      E.filePickerPanel.value = "";
      E.filePickerPanel.click();
    });
    E.filePickerPanel.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      files.forEach((f) => addFileAttachment(f, selectedConv));
      E.filePickerPanel.value = "";
    });

    // Emoji reaction picker (tiny mock)
    E.btnEmoji.addEventListener("click", () => {
      const emojis = ["👍", "❤️", "🔥", "🎉", "👀", "✅"];
      const lastMsg = state.messages[state.messages.length - 1];
      if (!lastMsg) {
        UI.toast("No message to react to yet.");
        return;
      }
      UI.showDialog({
        title: "Add reaction",
        message: "Pick an emoji to react to the latest message.",
        confirmLabel: "React",
        cancelLabel: "Cancel",
        onConfirm: (emoji) => {
          const e = (emoji || "").trim() || "👍";
          onToggleReaction(lastMsg.id, e);
        },
      });
      const input = document.getElementById("dialog-input");
      if (input) {
        input.value = "";
        input.placeholder = "e.g. 🔥";
        const list = document.createElement("div");
        list.style.marginTop = "10px";
        emojis.forEach((em) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = em;
          b.style.cssText = "background:#F3F4F6;border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;margin-right:6px;font-size:1.1rem;";
          b.addEventListener("click", () => {
            input.value = em;
          });
          list.appendChild(b);
        });
        input.parentNode.insertBefore(list, input.nextSibling);
      }
    });
  }

  function addFileAttachment(file, conv) {
    if (!conv) {
      UI.toast("Open a conversation to attach a file.");
      return;
    }
    const sizeBytes = file.size || 0;
    const sizeText = sizeBytes > 1024 * 1024
      ? (sizeBytes / (1024 * 1024)).toFixed(2) + " MB"
      : (sizeBytes / 1024).toFixed(1) + " KB";
    const type = file.name.split(".").pop().toLowerCase();
    const mapped = type === "pdf" ? "pdf" : type === "fig" ? "fig" : type === "yaml" || type === "yml" ? "yaml" : "file";
    const attachment = {
      id: "f_" + Date.now(),
      name: file.name,
      type: mapped,
      size: sizeText,
      uploadedBy: CURRENT_USER_ID,
      uploadedAt: new Date().toISOString(),
      url: null, // simulated: no real storage
      [conv.type === "channel" ? "channelId" : "dmId"]: conv.id,
    };
    state.files.push(attachment);
    storage.save(state);
    UI.renderFiles(getFilesForConv(conv), conv.id, conv.type);
    UI.toast(`Attached ${file.name} (simulated upload)`);
  }

  // ---------- Huddle (simulated phone call) ----------

  function bindGlobalActions() {
    const E = UI.els;

    E.btnBack.addEventListener("click", () => {
      selectedConv = null;
      openThreadRoot = null;
      render();
    });

    E.btnCloseThread = document.getElementById("btn-close-thread");
    if (E.btnCloseThread) {
      E.btnCloseThread.addEventListener("click", closeThread);
    }

    E.btnCall.addEventListener("click", () => {
      if (!selectedConv) {
        UI.toast("Open a conversation first.");
        return;
      }
      startHuddle(selectedConv.id);
    });

    E.btnStartHuddle.addEventListener("click", () => {
      if (!selectedConv) return;
      startHuddle(selectedConv.id);
    });

    E.btnEndHuddle.addEventListener("click", () => {
      if (!selectedConv) return;
      endHuddle(selectedConv.id);
    });

    E.btnMute.addEventListener("click", () => {
      E.btnMute.classList.toggle("active");
      E.btnMute.title = E.btnMute.classList.contains("active") ? "Unmute microphone" : "Mute microphone";
      UI.toast(E.btnMute.classList.contains("active") ? "Microphone muted" : "Microphone unmuted");
    });

    E.btnHuddleVideo.addEventListener("click", () => {
      UI.toast("Camera is not available in this simulated huddle.");
    });

    // Nav buttons (Sidebar + untere Mobile-Navigation teilen sich dieselben data-view-Werte)
    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentView = btn.dataset.view;
        selectedConv = null;
        openThreadRoot = null;
        render();
        closeMobileNav();
      });
    });

    // Mobile-Navigation: ausklappbarer Sidebar-Drawer
    const btnMenu = document.getElementById("btn-menu");
    const btnCloseNav = document.getElementById("btn-close-nav");
    const navOverlay = document.getElementById("nav-overlay");

    function openMobileNav() {
      UI.els.sidebar.classList.add("open");
      if (navOverlay) navOverlay.classList.add("open");
    }
    function closeMobileNav() {
      UI.els.sidebar.classList.remove("open");
      if (navOverlay) navOverlay.classList.remove("open");
    }

    if (btnMenu) btnMenu.addEventListener("click", openMobileNav);
    if (btnCloseNav) btnCloseNav.addEventListener("click", closeMobileNav);
    if (navOverlay) navOverlay.addEventListener("click", closeMobileNav);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileNav();
    });

    // Create channel / DM
    document.getElementById("btn-create-channel").addEventListener("click", () => {
      UI.showDialog({
        title: "Create channel",
        message: "Enter a name for the new channel.",
        confirmLabel: "Create",
        cancelLabel: "Cancel",
        inputPlaceholder: "e.g. team-launch",
        onConfirm: (name) => createChannel(name, ""),
      });
    });
    document.getElementById("btn-create-dm").addEventListener("click", () => {
      const others = state.users.filter((u) => u.id !== CURRENT_USER_ID);
      if (others.length === 0) {
        UI.toast("No other users available.");
        return;
      }
      UI.showDialog({
        title: "Start direct message",
        message: "Choose a person to message.",
        confirmLabel: "Start",
        cancelLabel: "Cancel",
        onConfirm: (userId) => createDM(userId),
        inputPlaceholder: "User ID (e.g. u2, u3, u4, u5, u6)",
      });
      const input = document.getElementById("dialog-input");
      if (input) {
        input.value = "";
        const list = document.createElement("div");
        list.style.marginTop = "10px";
        list.style.display = "flex";
        list.style.flexDirection = "column";
        list.style.gap = "6px";
        others.forEach((u) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = `${u.name} (${u.id})`;
          b.style.cssText = "text-align:left;background:#F3F4F6;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.9rem;";
          b.addEventListener("click", () => {
            input.value = u.id;
          });
          list.appendChild(b);
        });
        input.parentNode.insertBefore(list, input.nextSibling);
      }
    });

    // Conv tab switching
    document.querySelectorAll(".conv-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (!selectedConv) return;
        const t = tab.dataset.tab;
        selectedConv._activeTab = t;
        if (t === "huddle" && selectedConv.id) {
          const huddle = state.huddles && state.huddles[selectedConv.id];
          UI.setHuddleActive(!!huddle);
          if (huddle) UI.renderHuddleParticipants(huddle.participants, state.users, CURRENT_USER_ID);
        }
        render();
      });
    });
  }

  function startHuddle(convId) {
    if (!state.huddles) state.huddles = {};
    const conv = getConv(convId, "channel") || getConv(convId, "dm");
    const participants = (conv && conv.members) || [CURRENT_USER_ID];
    state.huddles[convId] = {
      id: "huddle_" + Date.now(),
      convId,
      startedBy: CURRENT_USER_ID,
      startedAt: new Date().toISOString(),
      participants,
      active: true,
    };
    storage.save(state);
    UI.toast("Huddle started (simulated audio)");
    render();
  }

  function endHuddle(convId) {
    if (!state.huddles) return;
    delete state.huddles[convId];
    storage.save(state);
    UI.toast("Huddle ended");
    render();
  }

  // ---------- Public ----------

  return { init };
})();

// Initialise once the DOM is ready (script sits at end of <body>, so it may
// already be ready by the time this runs).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => APP.init());
} else {
  APP.init();
}

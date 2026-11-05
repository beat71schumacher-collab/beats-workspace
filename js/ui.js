/* ==========================================================================
   Beats Workspace — UI layer
   DOM rendering for lists, conversations, messages, threads, reactions,
   files, notes, and huddle. Communicates with app.js via callbacks.
   ========================================================================== */

const UI = (function () {
  const els = {
    app: document.getElementById("app"),
    sidebar: document.querySelector(".sidebar"),
    navItems: document.querySelectorAll(".nav-item"),
    listView: document.getElementById("list-view"),
    convView: document.getElementById("conversation-view"),
    listTitle: document.getElementById("list-title"),
    listItems: document.getElementById("list-items"),
    listEmpty: document.getElementById("list-empty"),
    convTitle: document.getElementById("conv-title"),
    convSubtitle: document.getElementById("conv-subtitle"),
    convAvatar: document.getElementById("conv-avatar"),
    messages: document.getElementById("messages"),
    threadBanner: document.getElementById("thread-banner"),
    filesContextName: document.getElementById("files-context-name"),
    filesList: document.getElementById("files-list"),
    notesEditor: document.getElementById("notes-editor"),
    messageInput: document.getElementById("message-input"),
    btnSend: document.getElementById("btn-send"),
    btnBack: document.getElementById("btn-back"),
    btnCall: document.getElementById("btn-call"),
    btnStartHuddle: document.getElementById("btn-start-huddle"),
    btnEndHuddle: document.getElementById("btn-end-huddle"),
    btnMute: document.getElementById("btn-mute"),
    btnHuddleVideo: document.getElementById("btn-huddle-video"),
    huddleActive: document.getElementById("huddle-active"),
    huddleParticipants: document.getElementById("huddle-participants"),
    huddleStatusText: document.getElementById("huddle-status-text"),
    searchInput: document.getElementById("search-input"),
    btnClearSearch: document.getElementById("btn-clear-search"),
    btnAttach: document.getElementById("btn-attach"),
    btnEmoji: document.getElementById("btn-emoji"),
    filePicker: document.getElementById("file-picker"),
    filePickerPanel: document.getElementById("file-picker-panel"),
    btnUploadFile: document.getElementById("btn-upload-file"),
    profileName: document.getElementById("profile-name"),
    profileAvatar: document.getElementById("profile-avatar"),
    profileStatus: document.getElementById("profile-status"),
  };

  let callbacks = {};

  function on(event, fn) {
    callbacks[event] = callbacks[event] || [];
    callbacks[event].push(fn);
  }
  function emit(event, data) {
    (callbacks[event] || []).forEach((fn) => fn(data));
  }

  // Avatar initials + color helper (giltiges SVG mit xmlns)
  function avatarFor(user) {
    const initials = (user.name || "U")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const color = user.color || "#94A3B8";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" style="width:100%;height:100%;display:block;">
      <circle cx="12" cy="12" r="10" fill="${color}"/>
      <text x="12" y="16" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // Platzhalter-SVG fuer fehlende Avatare (farbiger Kreis ohne Text)
  function avatarPlaceholder(color = "#94A3B8") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" style="width:100%;height:100%;display:block;">
      <circle cx="12" cy="12" r="10" fill="${color}"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return isToday ? hm : d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatRelative(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const secs = Math.floor((Date.now() - d) / 1000);
    if (secs < 60) return "gerade eben";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `vor ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std`;
    const days = Math.floor(hours / 24);
    return `vor ${days} Tagen`;
  }

  // ---------- Navigation ----------

  function renderSidebar(users, currentUserId) {
    const user = users.find((u) => u.id === currentUserId);
    if (user) {
      els.profileName.textContent = user.name;
      els.profileStatus.textContent =
        user.status === "online" ? "Online" : user.status === "away" ? "Away" : "Offline";
      els.profileAvatar.src = avatarFor(user);
      els.profileAvatar.style.display = "";
    } else {
      els.profileAvatar.style.display = "none";
    }
    // Highlight active nav item based on app state (handled by app.js via setActiveNav)
  }

  function setActiveNav(view) {
    els.navItems.forEach((item) => {
      const active = item.dataset.view === view;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ---------- List view ----------

  function renderList(items, options = {}) {
    const {
      type = "channel",
      onItemClick,
      selectedId,
      showSub = true,
      searchTerm = "",
    } = options;
    els.listItems.innerHTML = "";

    const term = searchTerm.toLowerCase();
    const filtered = items.filter((it) => {
      const haystack = `${it.name || ""} ${it.topic || ""} ${it.members ? it.members.join(" ") : ""}`.toLowerCase();
      return term ? haystack.includes(term) : true;
    });

    if (filtered.length === 0) {
      els.listEmpty.style.display = "block";
      els.listItems.style.display = "none";
      return;
    }
    els.listEmpty.style.display = "none";
    els.listItems.style.display = "block";

    filtered.forEach((it) => {
      const li = document.createElement("li");
      li.className = "list-item" + (it.id === selectedId ? " selected" : "");
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-label", it.name || it.id);
      li.dataset.id = it.id;

      let subText = "";
      if (type === "dm") {
        subText = it.type === "dm" ? "Direktnachricht" : "Kanal";
      } else if (showSub) {
        subText = it.topic || "Channel";
      }

      const countBadge = it.unread
        ? `<span class="item-count" style="color:var(--brand);font-weight:700;">●</span>`
        : "";

      li.innerHTML = `
        <div class="item-avatar" style="background:${it.color || "#94A3B8"}">
          <svg viewBox="0 0 24 24" style="width:18px;height:18px;display:block;margin:auto;">
            <text x="12" y="16" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">
              ${(it.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0,2)}
            </text>
          </svg>
        </div>
        <div class="item-body">
          <div class="item-name" title="${escapeHtml(it.name || "")}">${escapeHtml(it.name || "")}</div>
          ${subText ? `<div class="item-sub">${escapeHtml(subText)}</div>` : ""}
        </div>
        ${countBadge}
      `;

      li.addEventListener("click", () => onItemClick(it));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onItemClick(it);
      });
      els.listItems.appendChild(li);
    });
  }

  // ---------- Conversation header ----------

  function renderConvHeader(conv, users) {
    const user = users.find((u) => u.id === (conv.createdBy || conv.authorId || ""));
    els.convTitle.textContent = conv.name || conv.title || "Conversation";
    if (conv.type === "dm") {
      els.convSubtitle.textContent = "Direktnachricht";
    } else {
      const memberCount = (conv.members || []).length;
      els.convSubtitle.textContent = `${memberCount} Mitglieder • ${formatRelative(conv.createdAt)}`;
    }
    if (conv.avatar) {
      els.convAvatar.src = conv.avatar;
      els.convAvatar.style.display = "";
    } else if (user) {
      els.convAvatar.src = avatarFor(user);
      els.convAvatar.style.display = "";
    } else {
      els.convAvatar.src = avatarPlaceholder("#94A3B8");
      els.convAvatar.style.display = "";
    }
    els.convAvatar.alt = conv.name || "Conversation";
  }

  function setConvTabs(activeTab) {
    document.querySelectorAll(".conv-tab").forEach((tab) => {
      const isActive = tab.dataset.tab === activeTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    // Show/hide panels
    document.querySelectorAll(".conv-panel").forEach((panel) => {
      const show = panel.dataset.panel === activeTab;
      panel.classList.toggle("active", show);
    });
  }

  // ---------- Messages ----------

  function fileAttachmentHtml(file) {
    if (!file) return "";
    const size = file.sizeLabel || "";
    if (file.previewUrl) {
      return `<div class="msg-file" data-file-id="${escapeHtml(file.id || "")}">
        <img src="${escapeHtml(file.previewUrl)}" alt="${escapeHtml(file.name || "Bild")}" loading="lazy">
        <div class="msg-file-row">
          <div class="msg-file-icon">🖼️</div>
          <div>
            <div class="msg-file-name">${escapeHtml(file.name || "Bild")}</div>
            <div class="msg-file-meta">${escapeHtml(size)}</div>
          </div>
        </div>
      </div>`;
    }
    return `<div class="msg-file" data-file-id="${escapeHtml(file.id || "")}">
      <div class="msg-file-row">
        <div class="msg-file-icon">📎</div>
        <div>
          <div class="msg-file-name">${escapeHtml(file.name || "Datei")}</div>
          <div class="msg-file-meta">${escapeHtml(size)}</div>
        </div>
      </div>
    </div>`;
  }

  function wireFileClick(root, msg, onOpenFile) {
    const el = root.querySelector(".msg-file");
    if (!el || !onOpenFile || !msg.file) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpenFile(msg.file);
    });
  }

  function renderMessages(messages, users, currentUserId, onReply, onToggleReaction, onOpenThread, onOpenFile) {
    els.messages.innerHTML = "";
    messages.forEach((msg) => {
      const author = users.find((u) => u.id === msg.authorId);
      const isMe = msg.authorId === currentUserId;
      const msgEl = document.createElement("div");
      msgEl.className = "message" + (isMe ? " message-me" : "");
      msgEl.dataset.msgId = msg.id;

      const reactionsHtml = (msg.reactions || [])
        .map(
          (r) => `
          <div class="reaction${r.users.includes(currentUserId) ? " active" : ""}" data-emoji="${escapeHtml(r.emoji)}" data-msg-id="${msg.id}">
            ${escapeHtml(r.emoji)} <span class="reaction-count">${r.users.length}</span>
          </div>
        `
        )
        .join("");

      const threadLink = msg.replyCount > 0
        ? `<button class="icon-button thread-link" title="View thread (${msg.replyCount} replies)" style="margin-left:6px;color:var(--muted);">↪</button>`
        : "";

      const avatarImg = author
        ? `<img class="msg-avatar-img" src="${avatarFor(author)}" alt="">`
        : `<img class="msg-avatar-img" src="${avatarPlaceholder("#94A3B8")}" alt="">`;

      const bodyText = msg.file && (!msg.text || msg.text === msg.file.name)
        ? ""
        : `<div class="msg-body">${escapeHtml(msg.text || "")}</div>`;

      msgEl.innerHTML = `
        ${avatarImg}
        <div class="msg-content">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(author ? author.name : "Unbekannt")}</span>
            <span class="msg-time">${formatTime(msg.createdAt)}</span>
            ${threadLink}
          </div>
          ${bodyText}
          ${fileAttachmentHtml(msg.file)}
          <div class="msg-reactions">${reactionsHtml}</div>
        </div>
      `;

      msgEl.querySelectorAll(".reaction").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onToggleReaction(msg.id, btn.dataset.emoji);
        });
      });

      msgEl.querySelector(".thread-link")?.addEventListener("click", (e) => {
        e.stopPropagation();
        onOpenThread(msg);
      });

      wireFileClick(msgEl, msg, onOpenFile);

      msgEl.addEventListener("click", () => {
        if (msg.replyCount > 0) onOpenThread(msg);
      });

      els.messages.appendChild(msgEl);
    });
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  function appendMessage(msg, users, currentUserId, onToggleReaction, onOpenThread, onOpenFile) {
    const author = users.find((u) => u.id === msg.authorId);
    const isMe = msg.authorId === currentUserId;
    const msgEl = document.createElement("div");
    msgEl.className = "message" + (isMe ? " message-me" : "");
    msgEl.dataset.msgId = msg.id;

    const reactionsHtml = (msg.reactions || [])
      .map(
        (r) => `
        <div class="reaction${r.users.includes(currentUserId) ? " active" : ""}" data-emoji="${escapeHtml(r.emoji)}" data-msg-id="${msg.id}">
          ${escapeHtml(r.emoji)} <span class="reaction-count">${r.users.length}</span>
        </div>
      `
      )
      .join("");

    const avatarImg = author
      ? `<img class="msg-avatar-img" src="${avatarFor(author)}" alt="">`
      : `<img class="msg-avatar-img" src="${avatarPlaceholder("#94A3B8")}" alt="">`;

    const bodyText = msg.file && (!msg.text || msg.text === msg.file.name)
      ? ""
      : `<div class="msg-body">${escapeHtml(msg.text || "")}</div>`;

    msgEl.innerHTML = `
      ${avatarImg}
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-author">${escapeHtml(author ? author.name : "Unbekannt")}</span>
          <span class="msg-time">${formatTime(msg.createdAt)}</span>
        </div>
        ${bodyText}
        ${fileAttachmentHtml(msg.file)}
        <div class="msg-reactions">${reactionsHtml}</div>
      </div>
    `;

    msgEl.querySelectorAll(".reaction").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onToggleReaction(msg.id, btn.dataset.emoji);
      });
    });
    wireFileClick(msgEl, msg, onOpenFile);

    els.messages.appendChild(msgEl);
    scrollToBottom();
  }

  function showThreadBanner(show, rootName) {
    els.threadBanner.style.display = show ? "flex" : "none";
    if (show) {
      const labelEl = els.threadBanner.querySelector(".thread-label");
      if (labelEl) labelEl.textContent = `Thread in ${escapeHtml(rootName)}`;
    }
  }

  function setThreadTypingPlaceholder(placeholder) {
    els.messageInput.placeholder = placeholder;
  }

  // ---------- Files ----------

  function renderFiles(files, convId, convType, opts) {
    const { currentUserId, onOpen, onDelete } = opts || {};
    els.filesList.innerHTML = "";
    const convFiles = (files || []).filter((f) => {
      if (!convId) return true;
      return f.channelId === convId || f.channel_id === convId;
    });
    if (convFiles.length === 0) {
      els.filesList.innerHTML = `
        <div class="empty-panel">
          <div class="mock-label">Noch keine Dateien.</div>
          <p style="color:var(--muted);font-size:0.86rem;">Hänge Dateien über die Büroklammer an.</p>
        </div>`;
      return;
    }
    if (els.filesContextName) els.filesContextName.textContent = "Kanal";
    convFiles.forEach((f) => {
      const card = document.createElement("div");
      card.className = "file-card";
      const mine = currentUserId && (f.uploaderId === currentUserId || f.uploader_id === currentUserId);
      const thumb = f.previewUrl
        ? `<img class="file-thumb" src="${escapeHtml(f.previewUrl)}" alt="">`
        : `<div class="file-icon">📎</div>`;
      card.innerHTML = `
        ${thumb}
        <div class="file-body">
          <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
          <div class="file-meta">${escapeHtml(f.sizeLabel || "")} • ${escapeHtml(formatRelative(f.createdAt || f.created_at || f.uploadedAt))}</div>
        </div>
        <div class="file-actions">
          <button type="button" data-act="open">Öffnen</button>
          ${mine ? '<button type="button" class="danger" data-act="del">Löschen</button>' : ""}
        </div>
      `;
      card.querySelector('[data-act="open"]').addEventListener("click", () => onOpen && onOpen(f));
      const del = card.querySelector('[data-act="del"]');
      if (del) del.addEventListener("click", () => onDelete && onDelete(f));
      els.filesList.appendChild(card);
    });
  }

  // ---------- Notes ----------

  function renderNotes(convId, notes) {
    els.notesEditor.value = notes[convId] || "";
  }

  // ---------- Huddle ----------

  function setHuddleActive(active) {
    els.huddleActive.style.display = active ? "block" : "none";
    // Empty state toggled via CSS panel active logic handled by caller
  }

  function renderHuddleParticipants(participants, users, currentUserId) {
    els.huddleParticipants.innerHTML = "";
    participants.forEach((pid) => {
      const user = users.find((u) => u.id === pid);
      if (!user) return;
      const isMe = pid === currentUserId;
      const el = document.createElement("div");
      el.className = "huddle-participant";
      el.title = `${user.name}${isMe ? " (you)" : ""}`;
      el.style.background = user.color ? `rgba(${hexToRgb(user.color)},0.12)` : "#F8FAFC";
      el.textContent = (user.name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
      els.huddleParticipants.appendChild(el);
    });
  }

  function hexToRgb(hex) {
    const c = hex.replace("#", "");
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)].join(",");
  }

  // ---------- Composer ----------

  function setComposerEnabled(enabled) {
    els.messageInput.disabled = !enabled;
    els.btnSend.disabled = !enabled;
    els.btnAttach.disabled = !enabled;
  }

  function getMessageInput() {
    return els.messageInput.value;
  }
  function clearMessageInput() {
    els.messageInput.value = "";
    els.messageInput.style.height = "auto";
  }

  function autoResizeTextarea() {
    els.messageInput.style.height = "auto";
    els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 120) + "px";
  }

  // ---------- Search ----------

  function setSearchPlaceholder(text) {
    els.searchInput.placeholder = text;
  }

  // ---------- Toast ----------

  function toast(message, type = "info") {
    const container = document.getElementById("toast-container") || createToastContainer();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  function createToastContainer() {
    const c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
    return c;
  }

  // ---------- Dialog ----------

  function showDialog({ title, message, confirmLabel = "Create", cancelLabel = "Cancel", onConfirm, inputPlaceholder }) {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    const d = document.createElement("div");
    d.className = "dialog";
    let inputHtml = "";
    if (inputPlaceholder) {
      inputHtml = `<input type="text" id="dialog-input" placeholder="${escapeHtml(inputPlaceholder)}" autocomplete="off">`;
    }
    d.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${inputHtml}
      <div class="dialog-actions">
        <button class="icon-button" id="dialog-cancel">${escapeHtml(cancelLabel)}</button>
        <button class="primary-button" id="dialog-confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    `;
    overlay.appendChild(d);
    document.body.appendChild(overlay);

    const input = d.querySelector("#dialog-input");
    const confirm = d.querySelector("#dialog-confirm");
    const cancel = d.querySelector("#dialog-cancel");

    const close = () => overlay.remove();
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    confirm.addEventListener("click", () => {
      const value = input ? input.value : null;
      onConfirm(value);
      close();
    });
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { confirm.click(); }
        if (e.key === "Escape") close();
      });
    }
    input?.focus();
  }

  // Public API
  return {
    els,
    on,
    emit,
    renderSidebar,
    setActiveNav,
    renderList,
    renderConvHeader,
    setConvTabs,
    renderMessages,
    appendMessage,
    scrollToBottom,
    showThreadBanner,
    setThreadTypingPlaceholder,
    renderFiles,
    renderNotes,
    setHuddleActive,
    renderHuddleParticipants,
    setComposerEnabled,
    getMessageInput,
    clearMessageInput,
    autoResizeTextarea,
    setSearchPlaceholder,
    toast,
    showDialog,
    avatarFor,
    escapeHtml,
    formatTime,
    formatRelative,
  };
})();

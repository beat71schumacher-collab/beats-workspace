/* ==========================================================================
   Beats Workspace — Multi-user app (Supabase Auth + Realtime channels)
   Notes remain local demos. Chat, calls and files use Supabase.
   ========================================================================== */

const APP = (function () {
  let sb = null;
  let session = null;
  let profile = null;
  let profiles = [];
  let channels = [];
  let messages = []; // current channel messages
  let local = { files: [], notes: {}, huddles: {} };
  let currentView = "home";
  let selectedConv = null;
  let openThreadRoot = null;
  let searchTerm = "";
  let realtimeChannel = null;
  let messageIds = new Set();
  let channelFiles = [];
  let allFiles = [];
  let filesRealtime = null;

  async function init() {
    if (!window.supabase || !window.supabase.createClient) {
      console.error("supabase-js CDN missing");
      return;
    }
    sb = window.supabase.createClient(SB_URL, SB_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    local = localStore.load();

    await Auth.init(sb, { onSessionChange: handleSession });
    bindSearch();
    bindComposer();
    bindGlobalActions();
  }

  async function handleSession(next) {
    session = next;
    if (!session) {
      teardownRealtime();
      teardownFilesRealtime();
      if (window.Calls) Calls.teardown().catch(() => {});
      profile = null;
      channelFiles = [];
      allFiles = [];
      profiles = [];
      channels = [];
      messages = [];
      selectedConv = null;
      return;
    }
    await ensureProfile();
    await loadProfiles();
    await loadChannels();
    await initCalls();
    if (window.FilesApi) FilesApi.init(sb);
    subscribeFilesRealtime();
    render();
  }

  async function ensureProfile() {
    const uid = session.user.id;
    const metaName =
      (session.user.user_metadata && session.user.user_metadata.display_name) ||
      (session.user.email || "Nutzer").split("@")[0];
    const { data, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) {
      console.warn(error);
      UI.toast("Profil konnte nicht geladen werden.");
      return;
    }
    if (!data) {
      const colors = ["#7B2CBF", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#6366F1"];
      const color = colors[Math.abs(hashCode(uid)) % colors.length];
      const { data: created, error: insErr } = await sb
        .from("profiles")
        .insert({ id: uid, display_name: metaName, color })
        .select()
        .single();
      if (insErr) {
        console.warn(insErr);
        profile = { id: uid, display_name: metaName, color };
      } else {
        profile = created;
      }
    } else {
      profile = data;
    }
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return h | 0;
  }

  async function loadProfiles() {
    const { data, error } = await sb.from("profiles").select("*").order("display_name");
    if (error) {
      console.warn(error);
      profiles = profile ? [profile] : [];
      return;
    }
    profiles = (data || []).map(mapProfile);
  }

  function mapProfile(p) {
    return {
      id: p.id,
      name: p.display_name,
      display_name: p.display_name,
      email: "",
      role: "member",
      status: "online",
      avatar: null,
      color: p.color || "#94A3B8",
    };
  }

  async function loadChannels() {
    const { data, error } = await sb.from("channels").select("*").order("name");
    if (error) {
      console.warn(error);
      UI.toast("Kanaele konnten nicht geladen werden.");
      channels = [];
      return;
    }
    channels = (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      topic: c.topic || "",
      type: "channel",
      createdBy: c.created_by,
      createdAt: c.created_at,
      members: profiles.map((p) => p.id),
    }));
  }

  function currentUserId() {
    return session && session.user ? session.user.id : null;
  }

  function usersForUi() {
    return profiles.length ? profiles : profile ? [mapProfile(profile)] : [];
  }

  // ---------- Realtime ----------

  function teardownRealtime() {
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function subscribeChannel(channelId) {
    teardownRealtime();
    messageIds = new Set(messages.map((m) => m.id));
    realtimeChannel = sb
      .channel("room:" + channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "channel_id=eq." + channelId },
        async (payload) => {
          const row = payload.new;
          if (!row || messageIds.has(row.id)) return;
          let msg = mapMessage(row);
          if (row.file_id) {
            try {
              const { data: f } = await sb.from("files").select("*").eq("id", row.file_id).maybeSingle();
              msg.file = mapFileRow(f);
              if (msg.file && FilesApi.isImage(msg.file.mime, msg.file.name)) {
                msg.file.previewUrl = await FilesApi.signedUrl(msg.file.path, 3600);
              }
            } catch (_) {}
          }
          if (messageIds.has(msg.id)) return;
          messageIds.add(msg.id);
          messages.push(msg);
          if (selectedConv && selectedConv.id === channelId) {
            UI.appendMessage(msg, usersForUi(), currentUserId(), onToggleReaction, onOpenThread, openSharedFile);
          }
          if (msg.file) {
            loadChannelFiles(channelId).catch(() => {});
          }
        }
      )
      .subscribe();
  }

  function mapFileRow(f) {
    if (!f) return null;
    return {
      id: f.id,
      channelId: f.channel_id,
      channel_id: f.channel_id,
      uploaderId: f.uploader_id,
      uploader_id: f.uploader_id,
      name: f.name,
      size: f.size,
      sizeLabel: FilesApi.formatSize(f.size),
      mime: f.mime,
      path: f.path,
      createdAt: f.created_at,
      created_at: f.created_at,
      previewUrl: f.previewUrl || null,
    };
  }

  function mapMessage(row) {
    const fileRow = row.file || (row.files && !Array.isArray(row.files) ? row.files : null);
    return {
      id: row.id,
      text: row.body,
      body: row.body,
      authorId: row.author_id,
      channelId: row.channel_id,
      createdAt: row.created_at,
      fileId: row.file_id,
      file: mapFileRow(fileRow),
      reactions: [],
      replyCount: 0,
      threadRootId: null,
    };
  }

  async function enrichFilePreviews(fileList) {
    const out = [];
    for (const f of fileList || []) {
      const mapped = mapFileRow(f);
      if (mapped && FilesApi.isImage(mapped.mime, mapped.name) && mapped.path) {
        try {
          mapped.previewUrl = await FilesApi.signedUrl(mapped.path, 3600);
        } catch (_) {}
      }
      out.push(mapped);
    }
    return out;
  }

  async function loadMessages(channelId) {
    const { data, error } = await sb
      .from("messages")
      .select("*, file:files(*)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.warn(error);
      messages = [];
      return;
    }
    messages = (data || []).map(mapMessage);
    for (const m of messages) {
      if (m.file && FilesApi.isImage(m.file.mime, m.file.name) && m.file.path && !m.file.previewUrl) {
        try {
          m.file.previewUrl = await FilesApi.signedUrl(m.file.path, 3600);
        } catch (_) {}
      }
    }
    messageIds = new Set(messages.map((m) => m.id));
  }

  async function loadChannelFiles(channelId) {
    try {
      const rows = await FilesApi.listForChannel(channelId);
      channelFiles = await enrichFilePreviews(rows);
    } catch (e) {
      console.warn(e);
      channelFiles = [];
    }
  }

  async function loadAllFiles() {
    try {
      const rows = await FilesApi.listAll();
      allFiles = await enrichFilePreviews(rows);
    } catch (e) {
      console.warn(e);
      allFiles = [];
      UI.toast("Dateien konnten nicht geladen werden.");
    }
  }

  function subscribeFilesRealtime() {
    teardownFilesRealtime();
    if (!sb) return;
    filesRealtime = sb
      .channel("files-meta")
      .on("postgres_changes", { event: "*", schema: "public", table: "files" }, () => {
        if (selectedConv) loadChannelFiles(selectedConv.id).then(() => {
          if (selectedConv && (selectedConv._activeTab === "files" || currentView === "files")) render();
        });
        if (currentView === "files") loadAllFiles().then(() => render());
      })
      .subscribe();
  }

  function teardownFilesRealtime() {
    if (filesRealtime && sb) {
      try { sb.removeChannel(filesRealtime); } catch (_) {}
    }
    filesRealtime = null;
  }

  // ---------- Rendering ----------

  function render() {
    if (!session) return;
    const users = usersForUi();
    const uid = currentUserId();
    const E = UI.els;

    UI.renderSidebar(users, uid);
    UI.setActiveNav(currentView);

    if (currentView === "home" || currentView === "channels") {
      E.listView.style.display = "flex";
      E.convView.style.display = "none";
      E.listTitle.textContent = "Kanaele";
      UI.renderList(channels, {
        type: "channel",
        selectedId: selectedConv && selectedConv.type === "channel" ? selectedConv.id : null,
        onItemClick: (c) => openConversation(c),
        searchTerm,
      });
    } else if (currentView === "messages") {
      E.listView.style.display = "flex";
      E.convView.style.display = "none";
      E.listTitle.textContent = "Direktnachrichten";
      E.listItems.innerHTML = "";
      E.listEmpty.style.display = "block";
      E.listItems.style.display = "none";
      E.listEmpty.innerHTML =
        "<p>Direktnachrichten kommen spaeter. Nutze vorerst die Kanaele <strong>allgemein</strong> und <strong>random</strong>.</p>";
    } else if (currentView === "calls") {
      loadProfiles().then(() => renderCallsList());
      return; // renderCallsList paints list; avoid double paint below for calls
    } else if (currentView === "files") {
      loadAllFiles().then(() => renderFilesList());
      return;
    } else if (currentView === "notes") {
      renderNotesList();
    }

    if (selectedConv) {
      E.convView.style.display = "flex";
      E.listView.style.display = "none";
      UI.renderConvHeader(selectedConv, users);
      const tab = selectedConv._activeTab || "chat";
      UI.setConvTabs(tab);
      UI.renderMessages(messages, users, uid, onReply, onToggleReaction, onOpenThread, openSharedFile);
      UI.showThreadBanner(false, selectedConv.name);
      UI.setThreadTypingPlaceholder("Nachricht schreiben...");
      UI.renderFiles(channelFiles, selectedConv.id, selectedConv.type, {
        currentUserId: uid,
        onOpen: openSharedFile,
        onDelete: deleteSharedFile,
      });
      UI.renderNotes(selectedConv.id, local.notes);
      UI.setComposerEnabled(true);
      const delBtn = document.getElementById("btn-delete-channel");
      if (delBtn) {
        const canDel =
          selectedConv.type === "channel" &&
          selectedConv.createdBy === uid &&
          selectedConv.name !== "allgemein" &&
          selectedConv.name !== "random";
        delBtn.style.display = canDel ? "" : "none";
      }
      const huddle = local.huddles && local.huddles[selectedConv.id];
      UI.setHuddleActive(!!huddle);
      if (huddle) {
        UI.renderHuddleParticipants(huddle.participants, users, uid);
        E.huddleStatusText.textContent = "Huddle aktiv (Demo)";
      }
    } else {
      E.convView.style.display = "none";
      const delBtn = document.getElementById("btn-delete-channel");
      if (delBtn) delBtn.style.display = "none";
    }
  }

  function renderCallsList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Anrufe";
    const uid = currentUserId();
    const others = usersForUi().filter((u) => u.id !== uid);
    E.listItems.innerHTML = "";
    E.listEmpty.style.display = "none";
    E.listItems.style.display = "block";

    const note = document.createElement("li");
    note.className = "call-note";
    note.style.listStyle = "none";
    note.textContent =
      "Audio- und Videoanrufe. Eingehende Anrufe klingeln nur, solange die App offen ist (kein Push).";
    E.listItems.appendChild(note);

    if (others.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-item";
      empty.style.pointerEvents = "none";
      empty.innerHTML =
        '<div class="item-body"><div class="item-name">Noch niemand online registriert</div><div class="item-sub">Dein Kollege muss sich einmal registrieren, dann erscheint er hier.</div></div>';
      E.listItems.appendChild(empty);
      return;
    }

    others.forEach((u) => {
      const li = document.createElement("li");
      li.className = "call-user-row";
      const initials = (u.name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      li.innerHTML = `
        <div class="item-avatar" style="background:${u.color || "#7B2CBF"}">${initials}</div>
        <div class="call-user-meta">
          <div class="item-name">${UI.escapeHtml(u.name || "Nutzer")}</div>
          <div class="item-sub">Tippe Audio oder Video</div>
        </div>
        <div class="call-user-actions">
          <button type="button" data-act="audio" data-id="${u.id}">Audio</button>
          <button type="button" data-act="video" data-id="${u.id}">Video</button>
        </div>`;
      li.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          const video = btn.getAttribute("data-act") === "video";
          const peer = usersForUi().find((x) => x.id === id);
          if (!peer) return;
          Calls.startCall(peer.id, peer.name, video);
        });
      });
      E.listItems.appendChild(li);
    });
  }

  function renderFilesList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Dateien";
    const uid = currentUserId();
    E.listItems.innerHTML = "";
    if (!allFiles.length) {
      E.listEmpty.style.display = "block";
      E.listEmpty.innerHTML = "<p>Noch keine geteilten Dateien. Öffne einen Kanal und hänge etwas an.</p>";
      E.listItems.style.display = "none";
      return;
    }
    E.listEmpty.style.display = "none";
    E.listItems.style.display = "block";
    allFiles.forEach((f) => {
      const li = document.createElement("li");
      li.className = "list-item";
      const ch = channels.find((c) => c.id === f.channelId);
      const mine = f.uploaderId === uid;
      li.innerHTML = `
        <div class="item-avatar">${f.previewUrl ? "🖼️" : "📎"}</div>
        <div class="item-body">
          <div class="item-name">${UI.escapeHtml(f.name)}</div>
          <div class="item-sub">#${UI.escapeHtml(ch ? ch.name : "kanal")} • ${UI.escapeHtml(f.sizeLabel || "")} • ${UI.formatRelative(f.createdAt)}</div>
        </div>
        <div class="call-user-actions">
          <button type="button" data-act="open">Öffnen</button>
          ${mine ? '<button type="button" data-act="del">Löschen</button>' : ""}
        </div>`;
      li.querySelector('[data-act="open"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openSharedFile(f);
      });
      const del = li.querySelector('[data-act="del"]');
      if (del) {
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSharedFile(f);
        });
      }
      E.listItems.appendChild(li);
    });
  }

  function renderNotesList() {
    const E = UI.els;
    E.listView.style.display = "flex";
    E.convView.style.display = "none";
    E.listTitle.textContent = "Notizen (Demo)";
    const items = channels.filter((c) => local.notes[c.id]);
    E.listItems.innerHTML = "";
    if (items.length === 0) {
      E.listEmpty.style.display = "block";
      E.listEmpty.innerHTML = "<p>Notizen sind lokal und nur auf diesem Geraet sichtbar.</p>";
      E.listItems.style.display = "none";
      return;
    }
    E.listEmpty.style.display = "none";
    E.listItems.style.display = "block";
    items.forEach((c) => {
      const li = document.createElement("li");
      li.className = "list-item";
      li.innerHTML = `<div class="item-avatar" style="background:#7B2CBF">📝</div><div class="item-body"><div class="item-name">${UI.escapeHtml(
        c.name
      )}</div><div class="item-sub">Lokale Notiz</div></div>`;
      li.addEventListener("click", () => {
        currentView = "home";
        openConversation(c);
      });
      E.listItems.appendChild(li);
    });
  }

  async function openConversation(conv) {
    selectedConv = conv;
    openThreadRoot = null;
    conv._activeTab = conv._activeTab || "chat";
    await loadMessages(conv.id);
    await loadChannelFiles(conv.id);
    subscribeChannel(conv.id);
    render();
  }

  async function onReply(text) {
    if (!selectedConv || !session) return;
    const body = (text || "").trim();
    if (!body) return;
    UI.clearMessageInput();
    const { data, error } = await sb
      .from("messages")
      .insert({ channel_id: selectedConv.id, author_id: currentUserId(), body })
      .select()
      .single();
    if (error) {
      console.warn(error);
      UI.toast("Nachricht konnte nicht gesendet werden.");
      return;
    }
    // Realtime may also deliver; avoid duplicate.
    if (!messageIds.has(data.id)) {
      const msg = mapMessage(data);
      messageIds.add(msg.id);
      messages.push(msg);
      UI.appendMessage(msg, usersForUi(), currentUserId(), onToggleReaction, onOpenThread, openSharedFile);
    }
  }

  function onToggleReaction() {
    UI.toast("Reaktionen kommen spaeter (Demo).");
  }

  function onOpenThread() {
    UI.toast("Threads kommen spaeter. Schreib einfach im Kanal weiter.");
  }

  async function createChannel(name, topic) {
    const n = (name || "").trim();
    if (!n) return;
    const { data, error } = await sb
      .from("channels")
      .insert({ name: n, topic: topic || "", created_by: currentUserId() })
      .select()
      .single();
    if (error) {
      UI.toast(error.message || "Kanal konnte nicht erstellt werden.");
      return;
    }
    await loadChannels();
    UI.toast('Kanal "' + n + '" erstellt');
    const conv = channels.find((c) => c.id === data.id);
    if (conv) openConversation(conv);
    else render();
  }

  async function deleteChannel(conv) {
    if (!conv || conv.type !== "channel") return;
    if (conv.createdBy !== currentUserId()) {
      UI.toast("Nur eigene Kanaele koennen geloescht werden.");
      return;
    }
    if (conv.name === "allgemein" || conv.name === "random") {
      UI.toast("Standard-Kanaele bleiben erhalten.");
      return;
    }
    if (!confirm('Kanal "' + conv.name + '" wirklich loeschen?')) return;
    const { data, error } = await sb.from("channels").delete().eq("id", conv.id).select("id");
    if (error) {
      UI.toast(error.message || "Loeschen fehlgeschlagen.");
      return;
    }
    if (!data || !data.length) {
      UI.toast("Keine Berechtigung zum Loeschen.");
      return;
    }
    selectedConv = null;
    await loadChannels();
    UI.toast("Kanal geloescht");
    currentView = "channels";
    render();
  }

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

  function bindComposer() {
    const E = UI.els;
    E.messageInput.addEventListener("input", UI.autoResizeTextarea);
    E.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onReply(UI.getMessageInput());
      }
    });
    E.btnSend.addEventListener("click", () => onReply(UI.getMessageInput()));

    E.btnAttach.addEventListener("click", () => {
      E.filePicker.value = "";
      E.filePicker.click();
    });
    E.filePicker.addEventListener("change", (e) => {
      Array.from(e.target.files || []).forEach((f) => addFileAttachment(f, selectedConv));
      E.filePicker.value = "";
    });
    E.btnUploadFile.addEventListener("click", () => {
      E.filePickerPanel.value = "";
      E.filePickerPanel.click();
    });
    E.filePickerPanel.addEventListener("change", (e) => {
      Array.from(e.target.files || []).forEach((f) => addFileAttachment(f, selectedConv));
      E.filePickerPanel.value = "";
    });
    E.btnEmoji.addEventListener("click", () => UI.toast("Emoji-Reaktionen sind Demo."));
  }

  function showUpload(show, text) {
    const el = document.getElementById("upload-overlay");
    const label = document.getElementById("upload-overlay-text");
    if (!el) return;
    el.style.display = show ? "flex" : "none";
    if (label && text) label.textContent = text;
  }

  async function openSharedFile(file) {
    if (!file || !file.path) return;
    try {
      showUpload(true, "Link wird erstellt…");
      const url = await FilesApi.signedUrl(file.path, 120);
      showUpload(false);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      showUpload(false);
      UI.toast(e.message || "Datei konnte nicht geöffnet werden.");
    }
  }

  async function deleteSharedFile(file) {
    if (!file) return;
    if (!confirm('Datei "' + (file.name || "") + '" wirklich löschen?')) return;
    try {
      showUpload(true, "Datei wird gelöscht…");
      await FilesApi.remove(file);
      channelFiles = channelFiles.filter((f) => f.id !== file.id);
      allFiles = allFiles.filter((f) => f.id !== file.id);
      showUpload(false);
      UI.toast("Datei gelöscht");
      render();
    } catch (e) {
      showUpload(false);
      UI.toast(e.message || "Löschen fehlgeschlagen (nur eigene Dateien).");
    }
  }

  async function addFileAttachment(file, conv) {
    if (!conv || conv.type !== "channel") {
      UI.toast("Öffne zuerst einen Kanal, um Dateien zu teilen.");
      return;
    }
    if (!file) return;
    if (file.size > FilesApi.MAX_BYTES) {
      UI.toast("Datei zu gross (max. 25 MB).");
      return;
    }
    try {
      showUpload(true, "Datei wird hochgeladen…");
      const meta = await FilesApi.upload(file, {
        channelId: conv.id,
        userId: currentUserId(),
      });
      const { data: msgRow, error } = await sb
        .from("messages")
        .insert({
          channel_id: conv.id,
          author_id: currentUserId(),
          body: file.name,
          file_id: meta.id,
        })
        .select("*, file:files(*)")
        .single();
      if (error) throw error;
      let msg = mapMessage(msgRow);
      if (msg.file && FilesApi.isImage(msg.file.mime, msg.file.name)) {
        try {
          msg.file.previewUrl = await FilesApi.signedUrl(msg.file.path, 3600);
        } catch (_) {}
      }
      if (!messageIds.has(msg.id)) {
        messageIds.add(msg.id);
        messages.push(msg);
        UI.appendMessage(msg, usersForUi(), currentUserId(), onToggleReaction, onOpenThread, openSharedFile);
      }
      await loadChannelFiles(conv.id);
      showUpload(false);
      UI.toast("Datei geteilt");
      render();
    } catch (e) {
      console.warn(e);
      showUpload(false);
      UI.toast(e.message || "Upload fehlgeschlagen.");
    }
  }

  // ----------
  function bindGlobalActions() {
    const E = UI.els;

    E.btnBack.addEventListener("click", () => {
      selectedConv = null;
      teardownRealtime();
      render();
    });

    E.btnCall.addEventListener("click", () => {
      currentView = "calls";
      selectedConv = null;
      render();
    });
    const btnDelCh = document.getElementById("btn-delete-channel");
    if (btnDelCh) {
      btnDelCh.addEventListener("click", () => {
        if (selectedConv) deleteChannel(selectedConv);
      });
    }
    E.btnStartHuddle.addEventListener("click", () => {
      currentView = "calls";
      selectedConv = null;
      render();
    });
    if (E.btnEndHuddle) E.btnEndHuddle.addEventListener("click", () => Calls.hangup());
    if (E.btnMute) E.btnMute.addEventListener("click", () => Calls.toggleMute());
    if (E.btnHuddleVideo) E.btnHuddleVideo.addEventListener("click", () => Calls.toggleCamera());

    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentView = btn.dataset.view;
        selectedConv = null;
        teardownRealtime();
        // restore empty state text for channels list
        UI.els.listEmpty.innerHTML =
          "<p>Noch keine Unterhaltungen. Erstelle einen Kanal oder oeffne allgemein.</p>";
        render();
        closeMobileNav();
      });
    });

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

    document.getElementById("btn-create-channel").addEventListener("click", () => {
      UI.showDialog({
        title: "Kanal erstellen",
        message: "Name fuer den neuen Kanal.",
        confirmLabel: "Erstellen",
        cancelLabel: "Abbrechen",
        inputPlaceholder: "z.B. projekt-x",
        onConfirm: (name) => createChannel(name, ""),
      });
    });
    document.getElementById("btn-create-dm").addEventListener("click", () => {
      UI.toast("Direktnachrichten kommen spaeter — nutze die Kanaele.");
    });

    document.querySelectorAll(".conv-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (!selectedConv) return;
        selectedConv._activeTab = tab.dataset.tab;
        render();
      });
    });

    const btnUserMenu = document.getElementById("btn-user-menu");
    if (btnUserMenu) {
      btnUserMenu.addEventListener("click", () => {
        UI.showDialog({
          title: "Konto",
          message: (profile && profile.display_name ? profile.display_name : "Angemeldet") + " — abmelden?",
          confirmLabel: "Abmelden",
          cancelLabel: "Abbrechen",
          onConfirm: () => Auth.signOut(),
        });
      });
    }

    // Persist notes locally when typing
    if (E.notesEditor) {
      E.notesEditor.addEventListener("input", () => {
        if (!selectedConv) return;
        local.notes[selectedConv.id] = E.notesEditor.value;
        localStore.save(local);
      });
    }
  }

  function startHuddle(convId) {
    local.huddles = local.huddles || {};
    local.huddles[convId] = {
      id: "huddle_" + Date.now(),
      convId,
      startedBy: currentUserId(),
      startedAt: new Date().toISOString(),
      participants: [currentUserId()],
      active: true,
    };
    localStore.save(local);
    UI.toast("Huddle gestartet (nur Demo, kein Audio).");
    render();
  }

  function endHuddle(convId) {
    if (!local.huddles) return;
    delete local.huddles[convId];
    localStore.save(local);
    UI.toast("Huddle beendet");
    render();
  }


  // ---------- WebRTC calls UI ----------

  let callTimerIv = null;
  let callsBound = false;

  async function initCalls() {
    if (!window.Calls || !session) return;
    const name = (profile && (profile.display_name || profile.name)) || "Nutzer";
    await Calls.init(sb, session.user.id, name);
    if (!callsBound) {
      bindCallUi();
      callsBound = true;
    }
  }

  function callInitials(name) {
    return (name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function setCallVideos(local, remote, videoCall) {
    const remoteEl = document.getElementById("call-remote-video");
    const localEl = document.getElementById("call-local-video");
    const audioUi = document.getElementById("call-audio-ui");
    if (videoCall) {
      if (remoteEl) {
        remoteEl.style.display = "block";
        if (remote && remoteEl.srcObject !== remote) remoteEl.srcObject = remote;
        remoteEl.play().catch(() => {});
      }
      if (localEl) {
        localEl.style.display = "block";
        if (local && localEl.srcObject !== local) localEl.srcObject = local;
        localEl.muted = true;
        localEl.play().catch(() => {});
      }
      if (audioUi) audioUi.style.display = "none";
    } else {
      if (remoteEl) {
        // keep element for remote audio even in audio calls
        remoteEl.style.opacity = "0";
        remoteEl.style.pointerEvents = "none";
        if (remote && remoteEl.srcObject !== remote) remoteEl.srcObject = remote;
        remoteEl.play().catch(() => {});
      }
      if (localEl) localEl.style.display = "none";
      if (audioUi) audioUi.style.display = "block";
    }
  }

  function showIncoming(st) {
    const el = document.getElementById("call-incoming");
    const active = document.getElementById("call-active");
    if (active) active.style.display = "none";
    if (!el || !st.call) return;
    el.style.display = "flex";
    document.getElementById("call-incoming-name").textContent = st.call.peerName;
    document.getElementById("call-incoming-meta").textContent = st.call.video
      ? "Eingehender Videoanruf"
      : "Eingehender Audioanruf";
    document.getElementById("call-incoming-avatar").textContent = callInitials(st.call.peerName);
  }

  function showActive(st, statusText) {
    const el = document.getElementById("call-active");
    const incoming = document.getElementById("call-incoming");
    if (incoming) incoming.style.display = "none";
    if (!el || !st.call) return;
    el.style.display = "flex";
    document.getElementById("call-status-label").textContent = statusText || "Anruf";
    document.getElementById("call-peer-label").textContent = st.call.peerName || "";
    document.getElementById("call-active-name").textContent = st.call.peerName || "Anruf";
    document.getElementById("call-active-avatar").textContent = callInitials(st.call.peerName);
    document.getElementById("btn-call-cam").style.display = st.call.video ? "" : "none";
    document.getElementById("btn-call-flip").style.display = st.call.video ? "" : "none";
    setCallVideos(st.localStream, st.remoteStream, st.call.video);
  }

  function hideCallUi() {
    const a = document.getElementById("call-active");
    const i = document.getElementById("call-incoming");
    if (a) a.style.display = "none";
    if (i) i.style.display = "none";
    const remoteEl = document.getElementById("call-remote-video");
    const localEl = document.getElementById("call-local-video");
    if (remoteEl) {
      remoteEl.srcObject = null;
      remoteEl.style.opacity = "";
      remoteEl.style.pointerEvents = "";
      remoteEl.style.display = "";
    }
    if (localEl) localEl.srcObject = null;
    if (callTimerIv) {
      clearInterval(callTimerIv);
      callTimerIv = null;
    }
  }

  function startTimer() {
    if (callTimerIv) clearInterval(callTimerIv);
    const label = document.getElementById("call-timer");
    const status = document.getElementById("call-status-label");
    callTimerIv = setInterval(() => {
      const st = Calls.getState();
      const ms = st.elapsedMs || 0;
      const s = Math.floor(ms / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      if (label) label.textContent = mm + ":" + ss;
      if (status && st.state === "in-call") status.textContent = mm + ":" + ss;
    }, 500);
  }

  function bindCallUi() {
    Calls.on((event, data) => {
      if (event === "ringing-in") showIncoming(data);
      if (event === "ringing-out") showActive(data, "Klingelt…");
      if (event === "connecting") showActive(data, "Verbinde…");
      if (event === "in-call") {
        showActive(data, "Verbunden");
        startTimer();
      }
      if (event === "local-stream" || event === "remote-stream") {
        const st = Calls.getState();
        if (st.call) setCallVideos(st.localStream, st.remoteStream, st.call.video);
      }
      if (event === "controls") {
        const muteBtn = document.getElementById("btn-call-mute");
        const camBtn = document.getElementById("btn-call-cam");
        if (muteBtn) muteBtn.classList.toggle("active", !!data.muted);
        if (camBtn) camBtn.classList.toggle("active", !!data.cameraOff);
      }
      if (event === "ended") {
        hideCallUi();
        const reason = (data && data.reason) || "";
        if (reason === "declined") UI.toast("Anruf abgelehnt");
        else if (reason === "busy") UI.toast("Besetzt");
        else if (reason === "remote-hangup") UI.toast("Aufgelegt");
      }
      if (event === "error") UI.toast((data && data.message) || "Anruf-Fehler");
    });

    document.getElementById("btn-call-accept").addEventListener("click", () => Calls.accept());
    document.getElementById("btn-call-decline").addEventListener("click", () => Calls.decline());
    document.getElementById("btn-call-hangup").addEventListener("click", () => Calls.hangup());
    document.getElementById("btn-call-mute").addEventListener("click", () => Calls.toggleMute());
    document.getElementById("btn-call-cam").addEventListener("click", () => Calls.toggleCamera());
    document.getElementById("btn-call-flip").addEventListener("click", () => Calls.switchCamera());
  }

  return { init, createChannel, deleteChannel, getChannels: () => channels, getSelected: () => selectedConv };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => APP.init());
} else {
  APP.init();
}

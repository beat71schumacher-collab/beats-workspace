/* Beats Workspace — Supabase Storage file helpers */
const FilesApi = (function () {
  const BUCKET = "files";
  const MAX_BYTES = 25 * 1024 * 1024;

  let sb = null;

  function init(client) {
    sb = client;
  }

  function formatSize(n) {
    if (n == null) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function isImage(mime, name) {
    if (mime && mime.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name || "");
  }

  function safeName(name) {
    return String(name || "datei")
      .replace(/[^\w.\-()+ äöüÄÖÜß]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120);
  }

  async function listAll() {
    const { data, error } = await sb
      .from("files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  async function listForChannel(channelId) {
    if (!channelId) return [];
    const { data, error } = await sb
      .from("files")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  async function signedUrl(path, expiresSec) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresSec || 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function upload(file, { channelId, userId, onProgress }) {
    if (!file) throw new Error("Keine Datei gewählt.");
    if (file.size > MAX_BYTES) throw new Error("Datei zu gross (max. 25 MB).");
    if (!userId) throw new Error("Nicht angemeldet.");

    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const path = userId + "/" + id + "_" + safeName(file.name);
    if (onProgress) onProgress(0.1);

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw upErr;
    if (onProgress) onProgress(0.7);

    const row = {
      channel_id: channelId || null,
      uploader_id: userId,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      path,
    };
    const { data: meta, error: metaErr } = await sb.from("files").insert(row).select().single();
    if (metaErr) {
      // best-effort cleanup of orphaned storage object
      try {
        await sb.storage.from(BUCKET).remove([path]);
      } catch (_) {}
      throw metaErr;
    }
    if (onProgress) onProgress(1);
    return meta;
  }

  async function remove(fileRow) {
    if (!fileRow || !fileRow.path || !fileRow.id) throw new Error("Datei unbekannt.");
    // Metadata first — RLS must return the deleted row; silent 0-row deletes are denied.
    const { data, error } = await sb.from("files").delete().eq("id", fileRow.id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("Keine Berechtigung — nur eigene Dateien löschen.");
    const { error: stErr } = await sb.storage.from(BUCKET).remove([fileRow.path]);
    if (stErr) throw stErr;
  }

  return {
    init,
    MAX_BYTES,
    formatSize,
    isImage,
    listAll,
    listForChannel,
    signedUrl,
    upload,
    remove,
  };
})();

window.FilesApi = FilesApi;

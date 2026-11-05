/* Local storage only for demo features (files, notes, huddles). */
const LOCAL_KEY = "beats-workspace-local-v3";

const localStore = {
  load() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return {
            files: Array.isArray(parsed.files) ? parsed.files : [],
            notes: parsed.notes || {},
            huddles: parsed.huddles || {},
          };
        }
      }
    } catch (e) {
      /* ignore */
    }
    return { files: [], notes: {}, huddles: {} };
  },
  save(local) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
    } catch (e) {
      console.warn("Beats Workspace: localStorage write failed", e);
    }
  },
};

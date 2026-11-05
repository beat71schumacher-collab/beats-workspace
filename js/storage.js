/* ==========================================================================
   Beats Workspace — Storage layer
   Persists app state in the browser's localStorage so data survives refreshes.
   Falls back to the sample data on first launch.
   ========================================================================== */

const STORAGE_KEY = "beats-workspace-v1";
const CURRENT_USER_ID = "u1"; // signed-in user for this local demo

const storage = {
  // Read all state, seeding from sample data if absent.
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users) return parsed;
      }
    } catch (e) {
      // ignore parse errors; reseed below
    }
    return this.seed();
  },

  // Save full state to localStorage.
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Beats Workspace: unable to write to localStorage", e);
    }
  },

  // Fresh seed from sample data.
  seed() {
    const users = SAMPLE_USERS.map((u) => ({ ...u }));
    const channels = SAMPLE_CHANNELS.map((c) => ({ ...c, members: [...c.members] }));
    const dms = SAMPLE_DMS.map((d) => ({ ...d, members: [...d.members] }));
    const files = SAMPLE_FILES.map((f) => ({ ...f }));
    const messages = SAMPLE_MESSAGES.map((m) => ({
      ...m,
      reactions: m.reactions ? m.reactions.map((r) => ({ emoji: r.emoji, users: [...r.users] })) : [],
    }));
    const threads = SAMPLE_THREAD_REPLIES.map((t) => ({
      ...t,
      reactions: t.reactions ? t.reactions.map((r) => ({ emoji: r.emoji, users: [...r.users] })) : [],
    }));
    const notes = { ...SAMPLE_NOTES };

    return {
      users,
      channels,
      dms,
      files,
      messages,
      threads,
      notes,
      settings: { theme: "purple", notifications: true },
      createdAt: new Date().toISOString(),
    };
  },

  // Reset to seed data (useful for testing).
  reset() {
    const state = this.seed();
    this.save(state);
    return state;
  },
};



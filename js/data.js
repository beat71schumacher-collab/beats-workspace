/* ==========================================================================
   Beats Workspace — Sample data (original, fictional)
   Seed data so the app works immediately with realistic content.
   Supports 5+ users out of the box.
   ========================================================================== */

const SAMPLE_USERS = [
  {
    id: "u1",
    name: "Alex Rivera",
    email: "alex.rivera@beatswork.example",
    role: "owner",
    status: "online",
    avatar: null, // generated initials
    color: "#7B2CBF",
  },
  {
    id: "u2",
    name: "Samira Chen",
    email: "samira.chen@beatswork.example",
    role: "member",
    status: "online",
    avatar: null,
    color: "#0EA5E9",
  },
  {
    id: "u3",
    name: "Jamal Okonkwo",
    email: "jamal.okonkwo@beatswork.example",
    role: "member",
    status: "away",
    avatar: null,
    color: "#10B981",
  },
  {
    id: "u4",
    name: "Lena Petrova",
    email: "lena.petrova@beatswork.example",
    role: "member",
    status: "offline",
    avatar: null,
    color: "#F59E0B",
  },
  {
    id: "u5",
    name: "Diego Morales",
    email: "diego.morales@beatswork.example",
    role: "member",
    status: "online",
    avatar: null,
    color: "#EC4899",
  },
  {
    id: "u6",
    name: "Priya Nair",
    email: "priya.nair@beatswork.example",
    role: "member",
    status: "online",
    avatar: null,
    color: "#6366F1",
  },
];

const now = () => new Date().toISOString();

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

const SAMPLE_CHANNELS = [
  {
    id: "c1",
    name: "Announcements",
    type: "channel",
    topic: "Company-wide updates and announcements",
    createdBy: "u1",
    createdAt: minutesAgo(10000),
    members: ["u1", "u2", "u3", "u4", "u5", "u6"],
    isDefault: true,
  },
  {
    id: "c2",
    name: "product-design",
    type: "channel",
    topic: "UI/UX discussions, mockups, and design reviews",
    createdBy: "u2",
    createdAt: minutesAgo(8200),
    members: ["u1", "u2", "u3", "u5"],
  },
  {
    id: "c3",
    name: "engineering",
    type: "channel",
    topic: "Backend, frontend, and devops talk",
    createdBy: "u3",
    createdAt: minutesAgo(5400),
    members: ["u1", "u2", "u3", "u6"],
  },
  {
    id: "c4",
    name: "marketing",
    type: "channel",
    topic: "Campaigns, launches, and social media",
    createdBy: "u5",
    createdAt: minutesAgo(3100),
    members: ["u1", "u4", "u5", "u6"],
  },
  {
    id: "c5",
    name: "random",
    type: "channel",
    topic: "Watercooler chat, memes, and off-topic fun",
    createdBy: "u1",
    createdAt: minutesAgo(1200),
    members: ["u1", "u2", "u3", "u4", "u5", "u6"],
  },
];

// Helper to build a direct message key for two users
const dmKey = (a, b) => [a, b].sort().join(",");

const SAMPLE_DMS = [
  { id: "dm1", type: "dm", members: ["u1", "u2"], name: "Samira Chen", createdAt: minutesAgo(9000) },
  { id: "dm2", type: "dm", members: ["u1", "u3"], name: "Jamal Okonkwo", createdAt: minutesAgo(7000) },
  { id: "dm3", type: "dm", members: ["u1", "u4"], name: "Lena Petrova", createdAt: minutesAgo(4000) },
  { id: "dm4", type: "dm", members: ["u1", "u5"], name: "Diego Morales", createdAt: minutesAgo(900) },
];

const SAMPLE_FILES = [
  {
    id: "f1",
    name: "Q3 Product Roadmap.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedBy: "u2",
    uploadedAt: minutesAgo(2600),
    channelId: "c2",
    url: null, // simulated local file
  },
  {
    id: "f2",
    name: "Brand Guidelines v2.pdf",
    type: "pdf",
    size: "5.1 MB",
    uploadedBy: "u5",
    uploadedAt: minutesAgo(1800),
    channelId: "c4",
    url: null,
  },
  {
    id: "f3",
    name: "Login Flow.fig",
    type: "fig",
    size: "1.2 MB",
    uploadedBy: "u2",
    uploadedAt: minutesAgo(900),
    channelId: "c2",
    url: null,
  },
  {
    id: "f4",
    name: "API Specification.yaml",
    type: "yaml",
    size: "34 KB",
    uploadedBy: "u3",
    uploadedAt: minutesAgo(400),
    channelId: "c3",
    url: null,
  },
];

const SAMPLE_MESSAGES = [
  // Announcements channel
  {
    id: "m1",
    channelId: "c1",
    authorId: "u1",
    text: "Welcome to Beats Workspace! This is your team hub for chat, files, notes, and huddles.",
    createdAt: minutesAgo(9800),
    reactions: [],
    replyCount: 2,
    threadRootId: null,
  },
  {
    id: "m2",
    channelId: "c1",
    authorId: "u2",
    text: "Great to be here. Looking forward to collaborating with everyone.",
    createdAt: minutesAgo(9600),
    reactions: [{ emoji: "👋", users: ["u1", "u3"] }],
    replyCount: 0,
    threadRootId: null,
  },
  {
    id: "m3",
    channelId: "c1",
    authorId: "u3",
    text: "Don't forget the all-hands meeting tomorrow at 10:00 AM.",
    createdAt: minutesAgo(9400),
    reactions: [{ emoji: "📅", users: ["u1"] }],
    replyCount: 1,
    threadRootId: null,
  },
  // Product design channel
  {
    id: "m4",
    channelId: "c2",
    authorId: "u2",
    text: "I've shared the new login mockups in the Files tab. Feedback welcome by EOD.",
    createdAt: minutesAgo(2500),
    reactions: [{ emoji: "🔥", users: ["u1", "u5"] }],
    replyCount: 3,
    threadRootId: null,
  },
  {
    id: "m5",
    channelId: "c2",
    authorId: "u5",
    text: "Love the direction on the onboarding screens. Clean and modern.",
    createdAt: minutesAgo(2400),
    reactions: [],
    replyCount: 0,
    threadRootId: null,
  },
  // Engineering channel
  {
    id: "m6",
    channelId: "c3",
    authorId: "u3",
    text: "The staging deploy is complete. Let me know if you see anything odd.",
    createdAt: minutesAgo(300),
    reactions: [],
    replyCount: 0,
    threadRootId: null,
  },
  {
    id: "m7",
    channelId: "c3",
    authorId: "u6",
    text: "Deploy looks good on my end. Thanks Jamal!",
    createdAt: minutesAgo(200),
    reactions: [{ emoji: "✅", users: ["u3"] }],
    replyCount: 0,
    threadRootId: null,
  },
  // Random channel
  {
    id: "m8",
    channelId: "c5",
    authorId: "u4",
    text: "Who's bringing snacks to the Friday hangout?",
    createdAt: minutesAgo(100),
    reactions: [{ emoji: "🍕", users: ["u1", "u2", "u6"] }],
    replyCount: 0,
    threadRootId: null,
  },
  // Direct messages
  {
    id: "dm_m1",
    dmId: "dm1",
    authorId: "u2",
    text: "Hey Alex, did you see the design review notes?",
    createdAt: minutesAgo(800),
    reactions: [],
    replyCount: 0,
    threadRootId: null,
  },
  {
    id: "dm_m2",
    dmId: "dm1",
    authorId: "u1",
    text: "Not yet, I'll take a look now.",
    createdAt: minutesAgo(750),
    reactions: [],
    replyCount: 0,
    threadRootId: null,
  },
  {
    id: "dm_m3",
    dmId: "dm2",
    authorId: "u3",
    text: "Ping me when you're free to pair on the API task.",
    createdAt: minutesAgo(600),
    reactions: [],
    replyCount: 0,
    threadRootId: null,
  },
];

// Thread replies (sample)
const SAMPLE_THREAD_REPLIES = [
  {
    id: "tr1",
    rootId: "m3",
    channelId: "c1",
    authorId: "u1",
    text: "Thanks for the reminder Jamal — added to my calendar.",
    createdAt: minutesAgo(9300),
    reactions: [],
    replyCount: 0,
    threadRootId: "m3",
  },
  {
    id: "tr2",
    rootId: "m4",
    channelId: "c2",
    authorId: "u3",
    text: "The mobile states look solid. One small tweak on the error banner.",
    createdAt: minutesAgo(2300),
    reactions: [],
    replyCount: 0,
    threadRootId: "m4",
  },
];

// Notes content per conversation
const SAMPLE_NOTES = {
  c1: "# Team Notes\n\nWelcome to the Announcements channel. Use this space to capture shared notes, decisions, and action items.",
  c2: "# Product Design Notes\n\n- Login mockups v2 approved\n- Onboarding flow needs one more pass\n- Next review: Friday 2 PM",
};



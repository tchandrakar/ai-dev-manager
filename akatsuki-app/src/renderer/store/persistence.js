const KEY = "akatsuki:state";

const defaults = {
  workingDir: null,
  activePR: null,
  gitConnections: {
    github: { connected: false, token: "", username: "" },
    gitlab: { connected: false, token: "", username: "" },
    bitbucket: { connected: false, token: "", username: "" },
  },
  aiAgents: {
    anthropic: { enabled: false, apiKey: "", model: "claude-sonnet-4-6" },
    openai: { enabled: false, apiKey: "", model: "gpt-4o" },
    gemini: { enabled: false, apiKey: "", model: "gemini-1.5-pro" },
  },
  preferences: {
    primaryAgent: "anthropic",
    fallbackAgent: "openai",
    autoReview: false,
    autoSave: true,
  },
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const saved = JSON.parse(raw);
    // Deep-merge nested objects so a partial/null saved state never wipes out defaults
    return {
      ...defaults,
      ...saved,
      activePR:       saved.activePR ?? null,
      gitConnections: { ...defaults.gitConnections, ...(saved.gitConnections ?? {}) },
      aiAgents:       { ...defaults.aiAgents,       ...(saved.aiAgents       ?? {}) },
      preferences:    { ...defaults.preferences,    ...(saved.preferences    ?? {}) },
    };
  } catch {
    return { ...defaults };
  }
}

export function saveState(state) {
  try {
    // diffFiles holds full raw diff text — can be many MB for large PRs.
    // Strip it before persisting so we never hit localStorage quota.
    // On restore the diff is re-fetched automatically (see ScreenReview).
    const toSave = {
      ...state,
      activePR: state.activePR
        ? { ...state.activePR, diffFiles: [] }
        : null,
    };
    localStorage.setItem(KEY, JSON.stringify(toSave));
  } catch {}
}

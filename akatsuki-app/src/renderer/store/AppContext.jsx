import { createContext, useContext, useReducer, useEffect, useRef } from "react";
import { loadState, saveState } from "./persistence";

const Ctx = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case "SET_WORKING_DIR":
      return { ...state, workingDir: action.payload };
    case "SET_GIT_CONNECTION":
      return { ...state, gitConnections: { ...state.gitConnections, [action.platform]: action.payload } };
    case "SET_AI_AGENT":
      return { ...state, aiAgents: { ...state.aiAgents, [action.provider]: action.payload } };
    case "SET_PREFERENCES":
      return { ...state, preferences: { ...state.preferences, ...action.payload } };
    case "SET_ACTIVE_PR":
      return { ...state, activePR: action.payload };
    case "SET_SCREEN":
      return { ...state, screen: action.payload };
    case "PATCH":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    ...loadState(),
    screen: "setup", // will be set to "review" after init
  }));

  // Determine initial screen based on workingDir
  useEffect(() => {
    if (state.workingDir) {
      dispatch({ type: "SET_SCREEN", payload: "review" });
    } else {
      dispatch({ type: "SET_SCREEN", payload: "setup" });
    }
  }, []);

  // Debounced persistence
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveState(state), 400);
  }, [state]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}

export function useWorkingDir() {
  const { state, dispatch } = useApp();
  return {
    workingDir: state.workingDir,
    setWorkingDir: (dir) => dispatch({ type: "SET_WORKING_DIR", payload: dir }),
  };
}

export function useAgents() {
  const { state, dispatch } = useApp();
  return {
    agents: state.aiAgents ?? {},
    setAgent: (provider, cfg) => dispatch({ type: "SET_AI_AGENT", provider, payload: cfg }),
    primaryAgent: state.preferences?.primaryAgent,
    getActiveAgent: () => {
      const pref = state.preferences?.primaryAgent ?? "anthropic";
      const agent = state.aiAgents?.[pref];
      if (agent?.enabled && agent?.apiKey) return { provider: pref, apiKey: agent.apiKey, model: agent.model };
      // fallback
      const fb = state.preferences?.fallbackAgent ?? "openai";
      const fbAgent = state.aiAgents?.[fb];
      if (fbAgent?.enabled && fbAgent?.apiKey) return { provider: fb, apiKey: fbAgent.apiKey, model: fbAgent.model };
      return null;
    },
  };
}

export function useGitConnections() {
  const { state, dispatch } = useApp();
  return {
    connections: state.gitConnections ?? {},
    setConnection: (platform, cfg) => dispatch({ type: "SET_GIT_CONNECTION", platform, payload: cfg }),
    getActiveToken: (platform) => state.gitConnections?.[platform]?.token ?? "",
  };
}

export function useActivePR() {
  const { state, dispatch } = useApp();
  return {
    activePR: state.activePR ?? null,
    setActivePR: (data) => dispatch({ type: "SET_ACTIVE_PR", payload: data }),
    clearActivePR: () => dispatch({ type: "SET_ACTIVE_PR", payload: null }),
  };
}

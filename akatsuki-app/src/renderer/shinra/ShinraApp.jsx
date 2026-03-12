import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { T } from "../tokens";

// ── localStorage persistence helpers ─────────────────────────────────────────
const LS_PREFIX = "shinra:";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveJSON(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
}

// ── Lazy screen imports ──────────────────────────────────────────────────────
const ScreenEditor = lazy(() => import("./ScreenEditor"));
const ScreenDebugger = lazy(() => import("./ScreenDebugger"));
const ScreenAIAssistant = lazy(() => import("./ScreenAIAssistant"));
const ScreenDiagram = lazy(() => import("./ScreenDiagram"));
const ScreenPlugins = lazy(() => import("./ScreenPlugins"));
const ScreenSearch = lazy(() => import("./ScreenSearch"));
const ScreenRunConfig = lazy(() => import("./ScreenRunConfig"));
const ScreenCallGraph = lazy(() => import("./ScreenCallGraph"));

// ── Context ──────────────────────────────────────────────────────────────────
const ShinraContext = React.createContext();
export const useShinra = () => React.useContext(ShinraContext);

// ── Loading fallback ─────────────────────────────────────────────────────────
function ScreenLoader() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T.fontUI,
        color: T.txt3,
        fontSize: 13,
      }}
    >
      Loading...
    </div>
  );
}

// ── TypeScript / JS syntax highlighter ───────────────────────────────────────
const TS_KEYWORDS = new Set([
  "import","export","from","const","let","var","function","return","if","else",
  "for","while","do","switch","case","break","continue","new","delete","typeof",
  "instanceof","in","of","class","extends","implements","interface","type","enum",
  "async","await","try","catch","finally","throw","yield","this","super","static",
  "public","private","protected","readonly","abstract","declare","module","namespace",
  "require","default","as","true","false","null","undefined","void","never",
]);

const TS_TYPES = new Set([
  "string","number","boolean","any","unknown","object","symbol","bigint",
  "Array","Promise","Map","Set","Record","Partial","Required","Omit","Pick",
  "Request","Response","NextFunction","Date","Error","RegExp",
]);

export function highlightTS(line) {
  const tokens = [];
  let i = 0;
  const src = line;

  while (i < src.length) {
    // Comments: // ...
    if (src[i] === "/" && src[i + 1] === "/") {
      tokens.push({ text: src.slice(i), color: T.txt3 });
      i = src.length;
      continue;
    }

    // Strings: 'xxx' or "xxx" or `xxx`
    if (src[i] === "'" || src[i] === '"' || src[i] === "`") {
      const q = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\") j++;
        j++;
      }
      j++;
      tokens.push({ text: src.slice(i, j), color: T.green });
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(src[i]) && (i === 0 || /[\s,=(><!;:[\]{}+\-*/]/.test(src[i - 1]))) {
      let j = i;
      while (j < src.length && /[\d.xXa-fA-F_n]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), color: T.amber });
      i = j;
      continue;
    }

    // Operators
    if (/[><=!+\-*/%&|^~?]/.test(src[i])) {
      let op = src[i];
      if (i + 1 < src.length && /[>=&|=]/.test(src[i + 1])) {
        op = src.slice(i, i + 2);
        if (i + 2 < src.length && src[i + 2] === "=") op = src.slice(i, i + 3);
      }
      tokens.push({ text: op, color: T.txt2 });
      i += op.length;
      continue;
    }

    // Words
    if (/[a-zA-Z_$]/.test(src[i])) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);

      if (TS_KEYWORDS.has(word)) {
        tokens.push({ text: word, color: T.purple, bold: true });
      } else if (TS_TYPES.has(word)) {
        tokens.push({ text: word, color: T.cyan });
      } else if (j < src.length && src[j] === "(") {
        tokens.push({ text: word, color: T.blue });
      } else {
        tokens.push({ text: word, color: T.txt });
      }
      i = j;
      continue;
    }

    // Decorators @
    if (src[i] === "@") {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), color: T.amber });
      i = j;
      continue;
    }

    // Brackets, parens, etc
    if (/[(){}[\],;:.]/.test(src[i])) {
      tokens.push({ text: src[i], color: T.txt2 });
      i++;
      continue;
    }

    tokens.push({ text: src[i], color: undefined });
    i++;
  }

  return tokens;
}

// ── Main ShinraApp component ─────────────────────────────────────────────────
function ShinraApp({ initialTab, onNavigate }) {
  // Tab state — driven by parent sidebar
  const [activeTab, setActiveTabRaw] = useState(initialTab || "editor");

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabRaw(initialTab);
    }
  }, [initialTab]);

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    if (onNavigate) onNavigate(`shinra:${tab}`);
  }, [onNavigate]);

  // Working directory
  const [workingDir, setWorkingDir] = useState(() => loadJSON("workdir", null));
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    saveJSON("workdir", workingDir);
  }, [workingDir]);

  // Open files / tabs
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);

  // Plugins
  const [plugins, setPlugins] = useState(() => loadJSON("plugins", [
    { id: "typescript", name: "TypeScript", abbr: "TS", version: "5.4.2", author: "Shinra Tensei", color: T.blue, category: "Language", installed: true, enabled: true, rating: 4.9, downloads: "2.1M", description: "Full TypeScript & JavaScript language support with IntelliSense" },
    { id: "python", name: "Python", abbr: "Py", version: "3.8.1", author: "Shinra Tensei", color: T.green, category: "Language", installed: true, enabled: true, rating: 4.8, downloads: "1.8M", description: "Python language support with debugging, linting, and venv" },
    { id: "rust", name: "Rust Analyzer", abbr: "Rs", version: "0.4.1", author: "rust-lang", color: T.red, category: "Language", installed: false, enabled: false, rating: 4.7, downloads: "890K", description: "Rust language support with real-time diagnostics and cargo integration" },
    { id: "go", name: "Go", abbr: "Go", version: "0.41.2", author: "golang", color: T.cyan, category: "Language", installed: false, enabled: false, rating: 4.8, downloads: "1.2M", description: "Rich Go language support including IntelliSense, debugging, and testing" },
    { id: "docker", name: "Docker", abbr: "\uD83D\uDC33", version: "1.28.0", author: "Microsoft", color: T.blue, category: "Tools", installed: true, enabled: true, rating: 4.6, downloads: "3.2M", description: "Build, manage and deploy containerized applications" },
    { id: "ai-code-lens", name: "AI Code Lens", abbr: "\u2726", version: "2.1.0", author: "Shinra Tensei", color: T.purple, category: "AI", installed: true, enabled: true, rating: 4.9, downloads: "1.5M", description: "AI-powered code suggestions, explanations, and refactoring" },
  ]));

  useEffect(() => {
    saveJSON("plugins", plugins);
  }, [plugins]);

  // Run configurations
  const [runConfigs, setRunConfigs] = useState(() => loadJSON("run-configs", []));
  useEffect(() => { saveJSON("run-configs", runConfigs); }, [runConfigs]);
  const [activeConfig, setActiveConfig] = useState(null);

  // Debug state
  const [debugSession, setDebugSession] = useState(null);

  // Search state (shared for Search Everywhere overlay)
  const [searchOpen, setSearchOpen] = useState(false);

  // AI chat history
  const [aiHistory, setAiHistory] = useState(() => loadJSON("ai-history", []));
  useEffect(() => { saveJSON("ai-history", aiHistory); }, [aiHistory]);

  // Context value
  const ctxValue = useMemo(
    () => ({
      activeTab, setActiveTab,
      workingDir, setWorkingDir,
      openFiles, setOpenFiles,
      activeFile, setActiveFile,
      plugins, setPlugins,
      runConfigs, setRunConfigs,
      activeConfig, setActiveConfig,
      debugSession, setDebugSession,
      searchOpen, setSearchOpen,
      aiHistory, setAiHistory,
    }),
    [
      activeTab, setActiveTab,
      workingDir,
      openFiles, activeFile,
      plugins,
      runConfigs, activeConfig,
      debugSession,
      searchOpen,
      aiHistory,
    ]
  );

  // Status bar text
  const statusText = useMemo(() => {
    switch (activeTab) {
      case "editor":
        return activeFile
          ? `${activeFile} | TypeScript | UTF-8 | LF`
          : workingDir ? `${workingDir}` : "No folder open";
      case "debugger":
        return debugSession ? `Debug Mode | ${debugSession.name}` : "No debug session";
      case "ai":
        return `AI Assistant | Claude Sonnet 4`;
      case "diagram":
        return "Dependency Graph";
      case "plugins":
        return `${plugins.filter(p => p.installed).length} installed | ${plugins.filter(p => !p.installed).length} available`;
      case "search":
        return "Search Everywhere";
      case "config":
        return `${runConfigs.length} configuration${runConfigs.length !== 1 ? "s" : ""}`;
      case "callgraph":
        return "Function Call Graph";
      default:
        return "Shinra Tensei IDE";
    }
  }, [activeTab, activeFile, workingDir, debugSession, plugins, runConfigs]);

  // Render active screen
  const renderScreen = () => {
    switch (activeTab) {
      case "editor": return <ScreenEditor />;
      case "debugger": return <ScreenDebugger />;
      case "ai": return <ScreenAIAssistant />;
      case "diagram": return <ScreenDiagram />;
      case "plugins": return <ScreenPlugins />;
      case "search": return <ScreenSearch />;
      case "config": return <ScreenRunConfig />;
      case "callgraph": return <ScreenCallGraph />;
      default: return null;
    }
  };

  return (
    <ShinraContext.Provider value={ctxValue}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          background: T.bg0,
          fontFamily: T.fontUI,
          color: T.txt,
          overflow: "hidden",
        }}
      >
        {/* ── Main content area ───────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Suspense fallback={<ScreenLoader />}>{renderScreen()}</Suspense>
        </main>

        {/* ── Status bar ──────────────────────────────────────────────── */}
        <footer
          style={{
            height: 20,
            minHeight: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: T.bg2,
            borderTop: `1px solid ${T.border}`,
            padding: "0 12px",
            fontFamily: T.fontUI,
            fontSize: 10,
            color: T.txt2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: debugSession ? T.amber : T.green,
                flexShrink: 0,
              }}
            />
            <span>{statusText}</span>
          </div>
          <span>Shinra Tensei v1.0</span>
        </footer>
      </div>
    </ShinraContext.Provider>
  );
}

export default ShinraApp;
export { ShinraContext };

import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { T } from "../tokens";
import { DB_TYPES } from "./mockData";

// ── localStorage persistence helpers ─────────────────────────────────────────
const LS_KEY_CONNECTIONS = "kawaiidb:connections";

function loadConnections() {
  try {
    const raw = localStorage.getItem(LS_KEY_CONNECTIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveConnections(conns) {
  try { localStorage.setItem(LS_KEY_CONNECTIONS, JSON.stringify(conns)); } catch {}
}

// ── Lazy screen imports ──────────────────────────────────────────────────────
const ScreenConnections = lazy(() => import("./ScreenConnections"));
const ScreenNavigator = lazy(() => import("./ScreenNavigator"));
const ScreenQuery = lazy(() => import("./ScreenQuery"));
const ScreenDashboard = lazy(() => import("./ScreenDashboard"));
const ScreenAIAnalyze = lazy(() => import("./ScreenAIAnalyze"));
const ScreenHistory = lazy(() => import("./ScreenHistory"));

// ── Context ──────────────────────────────────────────────────────────────────
const KawaiiContext = React.createContext();
export const useKawaii = () => React.useContext(KawaiiContext);

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

// ── Connection selector dropdown ─────────────────────────────────────────────
function ConnectionSelector({ connections, activeConnection, onSelect }) {
  const [open, setOpen] = useState(false);

  const onlineConnections = connections.filter((c) => c.status === "online");
  const selected = activeConnection;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: T.bg3,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: "4px 12px 4px 8px",
          cursor: "pointer",
          fontFamily: T.fontMono,
          fontSize: 11,
          color: T.txt,
          outline: "none",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: selected ? T.teal : T.txt3,
            flexShrink: 0,
          }}
        />
        <span>{selected ? selected.name : "No connection"}</span>
        <span style={{ color: T.txt3, fontSize: 10, marginLeft: 2 }}>
          {"\u25BE"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 220,
            background: T.bg3,
            border: `1px solid ${T.border2}`,
            borderRadius: 8,
            padding: 4,
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {onlineConnections.length === 0 && (
            <div
              style={{
                padding: "8px 12px",
                color: T.txt3,
                fontSize: 11,
                fontFamily: T.fontUI,
              }}
            >
              No online connections
            </div>
          )}
          {onlineConnections.map((conn) => {
            const dbInfo = DB_TYPES[conn.type];
            const isActive = selected && selected.id === conn.id;
            return (
              <button
                key={conn.id}
                onClick={() => {
                  onSelect(conn);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 10px",
                  background: isActive ? T.bg4 : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  color: isActive ? T.txt : T.txt2,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: T.green,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{conn.name}</span>
                <span
                  style={{
                    fontSize: 9,
                    color: dbInfo ? dbInfo.color : T.txt3,
                    fontWeight: 600,
                  }}
                >
                  {dbInfo ? dbInfo.abbr : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main KawaiiApp component ─────────────────────────────────────────────────
function KawaiiApp({ initialTab, onNavigate }) {
  // Tab state — driven by parent sidebar
  const [activeTab, setActiveTabRaw] = useState(initialTab || "connections");

  // Sync when parent sidebar navigates to a different KawaiiDB tab
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabRaw(initialTab);
    }
  }, [initialTab]);

  // Wrapped setter: updates local state AND notifies parent sidebar
  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    if (onNavigate) onNavigate(`kawaiidb:${tab}`);
  }, [onNavigate]);

  // Connection state — load from localStorage, persist on change
  const [connections, setConnections] = useState(loadConnections);
  const [activeConnection, setActiveConnection] = useState(null);
  const [showNewConnectionModal, setShowNewConnectionModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null); // null = new, object = editing

  // Persist connections whenever they change
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    saveConnections(connections);
  }, [connections]);

  // Navigator state
  const [navigatorView, setNavigatorView] = useState("editor");
  const [activeTable, setActiveTable] = useState(null);

  // Query state
  const [sqlTabs, setSqlTabs] = useState([
    { id: "tab-1", name: "Query 1", content: "" },
  ]);
  const [activeSqlTab, setActiveSqlTab] = useState("tab-1");

  const addSqlTab = useCallback(() => {
    const nextNum = sqlTabs.length + 1;
    const newTab = {
      id: `tab-${Date.now()}`,
      name: `Query ${nextNum}`,
      content: "",
    };
    setSqlTabs((prev) => [...prev, newTab]);
    setActiveSqlTab(newTab.id);
  }, [sqlTabs.length]);

  // Context value
  const ctxValue = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      activeConnection,
      setActiveConnection,
      showNewConnectionModal,
      setShowNewConnectionModal,
      editingConnection,
      setEditingConnection,
      navigatorView,
      setNavigatorView,
      activeTable,
      setActiveTable,
      sqlTabs,
      setSqlTabs,
      activeSqlTab,
      setActiveSqlTab,
      addSqlTab,
      connections,
      setConnections,
    }),
    [
      activeTab,
      setActiveTab,
      activeConnection,
      showNewConnectionModal,
      editingConnection,
      navigatorView,
      activeTable,
      sqlTabs,
      activeSqlTab,
      addSqlTab,
      connections,
    ]
  );

  // Status bar text
  const statusText = useMemo(() => {
    if (!activeConnection) return "No active connection";
    const dbInfo = DB_TYPES[activeConnection.type];
    const label = dbInfo ? dbInfo.label : activeConnection.type;
    switch (activeTab) {
      case "navigator":
        return `${activeConnection.name} | ${label} | ${activeConnection.database}${activeTable ? ` > ${activeTable}` : ""}`;
      case "query":
        return `${activeConnection.name} | ${label} | ${activeConnection.database} | ${sqlTabs.length} tab${sqlTabs.length !== 1 ? "s" : ""} open`;
      case "dashboard":
        return `${activeConnection.name} | ${label} | Server monitoring`;
      case "ai-analyze":
        return `${activeConnection.name} | ${label} | AI analysis mode`;
      case "history":
        return `History | 47 analyses | 31 applied | 12 indexes created | Avg improvement: 78%`;
      default:
        return `${activeConnection.name} | ${label} | ${activeConnection.host}`;
    }
  }, [activeConnection, activeTab, activeTable, sqlTabs.length]);

  // Whether to show connection selector (on non-connections tabs)
  const showConnectionSelector = activeTab !== "connections";

  // Render active screen
  const renderScreen = () => {
    switch (activeTab) {
      case "connections":
        return <ScreenConnections />;
      case "navigator":
        return <ScreenNavigator />;
      case "query":
        return <ScreenQuery />;
      case "dashboard":
        return <ScreenDashboard />;
      case "ai-analyze":
        return <ScreenAIAnalyze />;
      case "history":
        return <ScreenHistory />;
      default:
        return null;
    }
  };

  return (
    <KawaiiContext.Provider value={ctxValue}>
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
        {/* ── Connection bar (shown on non-connections tabs) ─────── */}
        {showConnectionSelector && (
          <div
            style={{
              height: 36,
              minHeight: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              background: T.bg1,
              borderBottom: `1px solid ${T.border}`,
              padding: "0 16px",
            }}
          >
            <ConnectionSelector
              connections={connections}
              activeConnection={activeConnection}
              onSelect={setActiveConnection}
            />
          </div>
        )}

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
                background: activeTab === "history" ? T.purple : activeConnection ? T.green : T.txt3,
                flexShrink: 0,
              }}
            />
            <span>{statusText}</span>
          </div>
          <span>KawaiiDB v1.0</span>
        </footer>
      </div>
    </KawaiiContext.Provider>
  );
}

export default KawaiiApp;
export { KawaiiContext };

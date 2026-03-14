import { useState, useEffect, lazy, Suspense } from "react";
import { AppProvider, useApp, useGitConnections } from "./store/AppContext";
import { GlobalStyles } from "./components";
import { T } from "./tokens";
import ScreenSetup from "./screens/ScreenSetup";
import ScreenReview from "./screens/ScreenReview";
import ScreenSettings from "./screens/ScreenSettings";
import ScreenHistory from "./screens/ScreenHistory";
import ScreenConnectors from "./screens/ScreenConnectors";

const KawaiiApp = lazy(() => import("./kawaiidb/KawaiiApp"));
const ShinraApp = lazy(() => import("./shinra/ShinraApp"));

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV_W   = 220; // expanded width
const NAV_C   =  48; // collapsed width (icons only)

// ── Tooltip wrapper (collapsed-state hover labels) ────────────────────────────
function Tip({ label, children }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: "absolute", left: NAV_C + 6, top: "50%", transform: "translateY(-50%)",
          background: T.bg4, border: `1px solid ${T.border2}`, borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: T.txt, whiteSpace: "nowrap",
          zIndex: 9999, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Icon-only nav button (collapsed mode) ────────────────────────────────────
function IconBtn({ icon, active, accentColor, tipLabel, onClick, style }) {
  const ac = accentColor ?? T.purple;
  return (
    <Tip label={tipLabel}>
      <div onClick={onClick} style={{
        width: NAV_C, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", borderRadius: 7, marginBottom: 2,
        background: active ? `${ac}18` : "transparent",
        borderLeft: `2px solid ${active ? ac : "transparent"}`,
        color: active ? ac : T.txt3,
        fontSize: 16, WebkitAppRegion: "no-drag",
        ...style,
      }}>
        {icon}
      </div>
    </Tip>
  );
}

// ── Full nav row (expanded mode) ──────────────────────────────────────────────
function NavRow({ icon, label, sub, active, accentColor, indent, onClick }) {
  const ac = accentColor ?? T.purple;
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: `8px 12px 8px ${12 + (indent ?? 0)}px`,
      borderRadius: 7, cursor: "pointer", marginBottom: 2,
      background: active ? `${ac}14` : "transparent",
      borderLeft: `2px solid ${active ? ac : "transparent"}`,
      WebkitAppRegion: "no-drag",
    }}>
      <span style={{ fontSize: indent ? 14 : 16, color: active ? ac : T.txt3, flexShrink: 0, width: 20, textAlign: "center" }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? T.txt : T.txt2, lineHeight: 1.3 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 10, color: T.txt3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Left Nav ──────────────────────────────────────────────────────────────────
function LeftNav({ screen, onNavigate, prData, historyCount, connections, collapsed, onToggle }) {
  // Whether the Sharingan sub-tree is open (only visible when nav is expanded)
  const [sharinganOpen, setSharinganOpen] = useState(true);
  const [kawaiiOpen, setKawaiiOpen] = useState(true);
  const [shinraOpen, setShinraOpen] = useState(true);

  const isSharing     = screen === "review" || screen === "history" || screen === "connectors";
  const isHistory     = screen === "history";
  const isConnectors  = screen === "connectors";
  const isSettings    = screen === "settings";
  const isKawaii      = screen.startsWith("kawaiidb");
  const isShinra      = screen.startsWith("shinra");

  const prSub = prData
    ? `PR #${prData.number} · ${(prData.repoSlug ?? "").split("/").pop()}`
    : "No PR loaded";

  const histSub = historyCount > 0
    ? `${historyCount} review${historyCount !== 1 ? "s" : ""}`
    : "No reviews yet";

  const connectedCount = Object.values(connections ?? {}).filter(c => c?.connected).length;
  const connSub = connectedCount > 0
    ? `${connectedCount} platform${connectedCount !== 1 ? "s" : ""} connected`
    : "No platforms connected";

  return (
    <div style={{
      width: collapsed ? NAV_C : NAV_W, flexShrink: 0,
      background: T.bg2, borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column",
      transition: "width 0.18s ease",
      overflow: "hidden",
    }}>
      {/* ── Header (macOS traffic-light drag region) ── */}
      <div style={{
        height: 44, flexShrink: 0, WebkitAppRegion: "drag",
        display: "flex", alignItems: "center",
        // Expanded: leave 76px for traffic lights + show logo + ‹ toggle
        // Collapsed: pure drag region — toggle lives in the nav body below
        padding: "0 8px 0 76px",
        gap: 8, borderBottom: `1px solid ${T.border}`,
      }}>
        {!collapsed && (
          <>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.purple, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.txt, lineHeight: 1.2 }}>Akatsuki</div>
              <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.fontMono, lineHeight: 1.4 }}>/  Sharingan</div>
            </div>
            {/* Collapse toggle — only in header when expanded (clear of traffic lights) */}
            <div
              onClick={onToggle}
              style={{
                WebkitAppRegion: "no-drag", cursor: "pointer", fontSize: 13, color: T.txt3,
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 5, flexShrink: 0,
              }}
              title="Collapse sidebar"
            >
              ‹
            </div>
          </>
        )}
      </div>

      {/* ── Nav body ── */}
      <div style={{ flex: 1, overflow: "auto", padding: collapsed ? "8px 0" : "10px 8px" }}>

        {collapsed ? (
          /* ── Collapsed: expand toggle first, then nav icons ── */
          <>
            {/* Expand toggle at top — safely below the traffic-light zone */}
            <Tip label="Expand sidebar">
              <div
                onClick={onToggle}
                style={{
                  width: NAV_C, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: T.txt3, fontSize: 14, marginBottom: 6,
                  WebkitAppRegion: "no-drag",
                }}
              >
                ›
              </div>
            </Tip>
            <div style={{ height: 1, background: T.border, margin: "0 10px 8px" }} />
            <IconBtn icon="◉" active={isSharing} tipLabel="Sharingan" onClick={() => onNavigate("review")} />
            <IconBtn icon={"\u2B21"} active={isKawaii} accentColor={T.teal} tipLabel="KawaiiDB" onClick={() => onNavigate("kawaiidb:connections")} />
            <IconBtn icon={"\u269B"} active={isShinra} accentColor={T.red} tipLabel="Shinra Tensei" onClick={() => onNavigate("shinra:editor")} />
          </>
        ) : (
          /* ── Expanded: label rows ── */
          <>
            {/* Sharingan parent row */}
            <div
              onClick={() => {
                onNavigate("review");
                setSharinganOpen(o => !o);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 7, cursor: "pointer", marginBottom: 2,
                background: isSharing ? `${T.purple}14` : "transparent",
                borderLeft: `2px solid ${isSharing ? T.purple : "transparent"}`,
                WebkitAppRegion: "no-drag",
              }}
            >
              <span style={{ fontSize: 16, color: isSharing ? T.purple : T.txt3, flexShrink: 0, width: 20, textAlign: "center" }}>◉</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: isSharing ? 600 : 400, color: isSharing ? T.txt : T.txt2, lineHeight: 1.3 }}>
                  Sharingan
                </div>
                <div style={{ fontSize: 10, color: T.txt3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {prSub}
                </div>
              </div>
              {/* Expand/collapse arrow */}
              <span style={{ fontSize: 9, color: T.txt3, flexShrink: 0 }}>
                {sharinganOpen ? "▾" : "▸"}
              </span>
            </div>

            {/* History sub-item */}
            {sharinganOpen && (
              <NavRow
                icon="≡" label="History" sub={histSub}
                active={isHistory} accentColor={T.blue}
                indent={16}
                onClick={() => onNavigate("history")}
              />
            )}

            {/* Connectors sub-item */}
            {sharinganOpen && (
              <NavRow
                icon="⎇" label="Connectors" sub={connSub}
                active={isConnectors} accentColor={T.cyan}
                indent={16}
                onClick={() => onNavigate("connectors")}
              />
            )}

            {/* ── KawaiiDB ── */}
            <div style={{ height: 1, background: T.border, margin: "8px 12px" }} />

            {/* KawaiiDB parent row */}
            <div
              onClick={() => {
                onNavigate("kawaiidb:connections");
                setKawaiiOpen(o => !o);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 7, cursor: "pointer", marginBottom: 2,
                background: isKawaii ? `${T.teal}14` : "transparent",
                borderLeft: `2px solid ${isKawaii ? T.teal : "transparent"}`,
                WebkitAppRegion: "no-drag",
              }}
            >
              <span style={{ fontSize: 16, color: isKawaii ? T.teal : T.txt3, flexShrink: 0, width: 20, textAlign: "center" }}>{"\u2B21"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: isKawaii ? 600 : 400, color: isKawaii ? T.txt : T.txt2, lineHeight: 1.3 }}>
                  KawaiiDB
                </div>
                <div style={{ fontSize: 10, color: T.txt3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Database Manager
                </div>
              </div>
              <span style={{ fontSize: 9, color: T.txt3, flexShrink: 0 }}>
                {kawaiiOpen ? "\u25BE" : "\u25B8"}
              </span>
            </div>

            {kawaiiOpen && (
              <>
                <NavRow icon={"\u26C1"} label="Connections" sub="Manage databases"
                  active={screen === "kawaiidb:connections"} accentColor={T.teal}
                  indent={16} onClick={() => onNavigate("kawaiidb:connections")} />
                <NavRow icon={"\u2261"} label="Navigator" sub="Browse & edit"
                  active={screen === "kawaiidb:navigator"} accentColor={T.blue}
                  indent={16} onClick={() => onNavigate("kawaiidb:navigator")} />
                <NavRow icon={"\u26A1"} label="Query" sub="SQL editor"
                  active={screen === "kawaiidb:query"} accentColor={T.green}
                  indent={16} onClick={() => onNavigate("kawaiidb:query")} />
                <NavRow icon={"\u2637"} label="Dashboard" sub="Monitoring"
                  active={screen === "kawaiidb:dashboard"} accentColor={T.amber}
                  indent={16} onClick={() => onNavigate("kawaiidb:dashboard")} />
                <NavRow icon={"\u2726"} label="AI Analyze" sub="Query optimizer"
                  active={screen === "kawaiidb:ai-analyze"} accentColor={T.purple}
                  indent={16} onClick={() => onNavigate("kawaiidb:ai-analyze")} />
                <NavRow icon={"\u2630"} label="History" sub="Analysis history"
                  active={screen === "kawaiidb:history"} accentColor={T.purple}
                  indent={16} onClick={() => onNavigate("kawaiidb:history")} />
              </>
            )}

            {/* ── Shinra Tensei ── */}
            <div style={{ height: 1, background: T.border, margin: "8px 12px" }} />

            <div
              onClick={() => {
                onNavigate("shinra:editor");
                setShinraOpen(o => !o);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 7, cursor: "pointer", marginBottom: 2,
                background: isShinra ? `${T.red}14` : "transparent",
                borderLeft: `2px solid ${isShinra ? T.red : "transparent"}`,
                WebkitAppRegion: "no-drag",
              }}
            >
              <span style={{ fontSize: 16, color: isShinra ? T.red : T.txt3, flexShrink: 0, width: 20, textAlign: "center" }}>{"\u269B"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: isShinra ? 600 : 400, color: isShinra ? T.txt : T.txt2, lineHeight: 1.3 }}>
                  Shinra Tensei
                </div>
                <div style={{ fontSize: 10, color: T.txt3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  IDE & Dev Tools
                </div>
              </div>
              <span style={{ fontSize: 9, color: T.txt3, flexShrink: 0 }}>
                {shinraOpen ? "\u25BE" : "\u25B8"}
              </span>
            </div>

            {shinraOpen && (
              <>
                <NavRow icon={"\u270E"} label="Editor" sub="Code editor"
                  active={screen === "shinra:editor"} accentColor={T.red}
                  indent={16} onClick={() => onNavigate("shinra:editor")} />
                <NavRow icon={"\u25B6"} label="Debugger" sub="Run & debug"
                  active={screen === "shinra:debugger"} accentColor={T.amber}
                  indent={16} onClick={() => onNavigate("shinra:debugger")} />
                <NavRow icon={"\u2726"} label="AI Assistant" sub="Claude-powered"
                  active={screen === "shinra:ai"} accentColor={T.purple}
                  indent={16} onClick={() => onNavigate("shinra:ai")} />
                <NavRow icon={"\u25CE"} label="Dependency Graph" sub="Module dependencies"
                  active={screen === "shinra:diagram"} accentColor={T.cyan}
                  indent={16} onClick={() => onNavigate("shinra:diagram")} />
                <NavRow icon={"\u2699"} label="Plugins" sub="Extensions"
                  active={screen === "shinra:plugins"} accentColor={T.green}
                  indent={16} onClick={() => onNavigate("shinra:plugins")} />
                <NavRow icon={"\u2315"} label="Search" sub="Search everywhere"
                  active={screen === "shinra:search"} accentColor={T.blue}
                  indent={16} onClick={() => onNavigate("shinra:search")} />
                <NavRow icon={"\u2261"} label="Run Config" sub="Launch configs"
                  active={screen === "shinra:config"} accentColor={T.teal}
                  indent={16} onClick={() => onNavigate("shinra:config")} />
                <NavRow icon={"\u2442"} label="Call Graph" sub="Function calls"
                  active={screen === "shinra:callgraph"} accentColor={T.amber}
                  indent={16} onClick={() => onNavigate("shinra:callgraph")} />
              </>
            )}
          </>
        )}
      </div>

      {/* ── Bottom: Settings only ── */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: collapsed ? "8px 0" : "8px 8px 10px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        {collapsed ? (
          <IconBtn icon="⚙" active={isSettings} tipLabel="Settings" onClick={() => onNavigate("settings")} />
        ) : (
          <>
            <NavRow icon="⚙" label="Settings" sub="AI Agents · Prefs"
              active={isSettings} onClick={() => onNavigate("settings")} />
            <div style={{ padding: "4px 14px 0", fontSize: 9, color: T.txt3, fontFamily: T.fontMono }}>
              v0.1.0-alpha
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── App Inner ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { state, dispatch } = useApp();
  const { connections }     = useGitConnections();
  const screen   = state.screen ?? "setup";
  const navigate = (s) => dispatch({ type: "SET_SCREEN", payload: s });

  // Persist collapse preference
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("akatsuki:nav-collapsed") === "true"; } catch { return false; }
  });
  const toggleCollapse = () => setCollapsed(v => {
    const next = !v;
    try { localStorage.setItem("akatsuki:nav-collapsed", String(next)); } catch {}
    return next;
  });

  const [historyCount, setHistoryCount] = useState(0);
  const refreshHistoryCount = () => {
    window.akatsuki.memory.listReviews({ limit: 1000 })
      .then(r => setHistoryCount(r.reviews?.length ?? 0))
      .catch(() => {});
  };
  useEffect(() => {
    if (screen !== "setup") refreshHistoryCount();
  }, [screen === "history"]); // re-run when entering history tab

  // Setup screen — no left nav
  if (screen === "setup") return <ScreenSetup />;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <LeftNav
        screen={screen}
        onNavigate={navigate}
        prData={state.activePR?.prData ?? null}
        historyCount={historyCount}
        connections={connections}
        collapsed={collapsed}
        onToggle={toggleCollapse}
      />
      <div key={screen.startsWith("kawaiidb") ? "kawaiidb" : screen.startsWith("shinra") ? "shinra" : screen} className="screen-enter" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {screen === "review"      && <ScreenReview onReviewSaved={refreshHistoryCount} />}
        {screen === "history"     && <ScreenHistory />}
        {screen === "connectors"  && <ScreenConnectors />}
        {screen === "settings"    && <ScreenSettings />}
        {screen.startsWith("kawaiidb") && (
          <Suspense fallback={<div style={{ flex: 1, background: T.bg0 }} />}>
            <KawaiiApp initialTab={screen.replace("kawaiidb:", "") || "connections"} onNavigate={navigate} />
          </Suspense>
        )}
        {screen.startsWith("shinra") && (
          <Suspense fallback={<div style={{ flex: 1, background: T.bg0 }} />}>
            <ShinraApp initialTab={screen.replace("shinra:", "") || "editor"} onNavigate={navigate} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <GlobalStyles />
      <AppInner />
    </AppProvider>
  );
}

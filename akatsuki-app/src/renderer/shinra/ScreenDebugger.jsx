import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge } from "../components";
import { useShinra, highlightTS } from "./ShinraApp";

// ── localStorage helpers ────────────────────────────────────────────────────
const LS_BP_KEY = "shinra:breakpoints";

function loadBreakpoints() {
  try {
    const raw = localStorage.getItem(LS_BP_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const result = {};
      for (const [file, lines] of Object.entries(obj)) {
        result[file] = new Set(lines);
      }
      return result;
    }
  } catch {}
  return {};
}

function saveBreakpoints(bpMap) {
  try {
    const obj = {};
    for (const [file, lineSet] of Object.entries(bpMap)) {
      obj[file] = [...lineSet];
    }
    localStorage.setItem(LS_BP_KEY, JSON.stringify(obj));
  } catch {}
}

// ── Detect runner from file extension ───────────────────────────────────────
function detectRunner(filePath) {
  if (!filePath) return null;
  const ext = filePath.split(".").pop().toLowerCase();
  switch (ext) {
    case "js": case "mjs": case "cjs":
      return { cmd: "node", label: "Node.js" };
    case "ts": case "tsx":
      return { cmd: "npx tsx", label: "tsx (TypeScript)" };
    case "py":
      return { cmd: "python3", label: "Python 3" };
    case "go":
      return { cmd: "go run", label: "Go" };
    case "rb":
      return { cmd: "ruby", label: "Ruby" };
    case "sh": case "bash":
      return { cmd: "bash", label: "Bash" };
    default:
      return null;
  }
}

// ── SVG Icons (inline, tiny) ────────────────────────────────────────────────
const Icon = ({ d, color = T.txt, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d={d} fill={color} />
  </svg>
);

const PlayIcon = ({ color }) => <Icon color={color} d="M4 2.5v11l9-5.5L4 2.5z" />;
const PauseIcon = ({ color }) => <Icon color={color} d="M4 2h3v12H4V2zm5 0h3v12H9V2z" />;
const StopIcon = ({ color }) => <Icon color={color} d="M3 3h10v10H3z" />;
const StepOverIcon = ({ color }) => <Icon color={color} d="M2 8h8M7 5l3 3-3 3M12 3v10" />;
const StepIntoIcon = ({ color }) => <Icon color={color} d="M8 2v9m-3-3l3 3 3-3M3 14h10" />;
const StepOutIcon = ({ color }) => <Icon color={color} d="M8 14V5m-3 3l3-3 3 3M3 2h10" />;
const RestartIcon = ({ color }) => <Icon color={color} d="M2 8a6 6 0 1 1 1.5 4M2 14V10h4" />;

// Use simple SVG arrows for step icons since Icon path approach is fill-only
const StepSvg = ({ children, color = T.txt }) => (
  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

// ── Sparkline data generation ────────────────────────────────────────────────
function generateSparkline(base, variance, count = 20) {
  const data = [];
  let val = base;
  for (let i = 0; i < count; i++) {
    val += (Math.random() - 0.5) * variance;
    val = Math.max(0, val);
    data.push(val);
  }
  return data;
}

// Static sparkline data (generated once at module level to avoid re-render flicker)
const SPARKLINE_DATA = {
  heap: generateSparkline(72, 15),
  cpu: generateSparkline(34, 20),
  eventLoop: generateSparkline(1.8, 1.2),
  handles: generateSparkline(42, 10),
};

// ── Sparkline SVG component ─────────────────────────────────────────────────
function Sparkline({ data, color, width = 120, height = 30 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = i * stepX;
    const y = height - ((val - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(" ");

  // Build area path for gradient fill
  const areaPath = data.map((val, i) => {
    const x = i * stepX;
    const y = height - ((val - min) / range) * (height - 2) - 1;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ") + ` L${width},${height} L0,${height} Z`;

  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── APM Stat Card ───────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color, sparkData }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        minWidth: 0,
        background: hov ? T.bg3 : T.bg2,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: "10px 14px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        transition: "background 0.15s",
        cursor: "default",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        color: T.txt3,
        fontFamily: T.fontUI,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: 4,
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: T.txt, fontFamily: T.fontMono, lineHeight: 1.1 }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI }}>
          {unit}
        </span>
      </div>
      <div style={{ marginTop: 2 }}>
        <Sparkline data={sparkData} color={color} width={120} height={28} />
      </div>
    </div>
  );
}

// ── Performance Timeline Chart ──────────────────────────────────────────────
const PERF_TIMELINE_DATA = (() => {
  const points = [];
  let val = 150;
  for (let i = 0; i < 30; i++) {
    val += (Math.random() - 0.4) * 20;
    val = Math.max(100, Math.min(320, val));
    points.push(val);
  }
  return points;
})();

function PerformanceTimeline() {
  const data = PERF_TIMELINE_DATA;
  const W = 600; // inner chart width (SVG viewBox coords)
  const H = 110;
  const padL = 36;
  const padR = 8;
  const padT = 4;
  const padB = 18;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const min = 0;
  const max = 350;
  const range = max - min;
  const stepX = chartW / (data.length - 1);

  const toX = (i) => padL + i * stepX;
  const toY = (val) => padT + chartH - ((val - min) / range) * chartH;

  // Build polyline points
  const linePoints = data.map((val, i) => `${toX(i)},${toY(val)}`).join(" ");

  // Build area path
  const areaPath = data.map((val, i) => {
    const x = toX(i);
    const y = toY(val);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ") + ` L${toX(data.length - 1)},${padT + chartH} L${padL},${padT + chartH} Z`;

  // Y-axis labels
  const yTicks = [0, 100, 200, 300];
  // X-axis labels (every 5 points = 5s)
  const xTicks = [0, 5, 10, 15, 20, 25, 29];

  // Grid lines
  const gridLines = yTicks.map((val) => toY(val));

  return (
    <div style={{
      background: T.bg2,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "10px 12px 6px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        color: T.txt3,
        fontFamily: T.fontUI,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{ width: 3, height: 12, background: T.blue, borderRadius: 2 }} />
        Performance Timeline
        <span style={{ marginLeft: "auto", fontSize: 9, color: T.txt3, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          Memory (MB)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 140, display: "block" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.blue} stopOpacity="0.3" />
            <stop offset="100%" stopColor={T.blue} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((y, i) => (
          <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke={T.border} strokeWidth={0.5} strokeDasharray="3,3" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((val, i) => (
          <text key={i} x={padL - 4} y={toY(val) + 3} textAnchor="end" fontSize={8} fill={T.txt3} fontFamily={T.fontMono}>
            {val}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((idx) => (
          <text key={idx} x={toX(idx)} y={H - 2} textAnchor="middle" fontSize={8} fill={T.txt3} fontFamily={T.fontMono}>
            {idx * 1}s
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#perfGrad)" />

        {/* Line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={T.blue}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ── Named sub-components ────────────────────────────────────────────────────

function BreakpointGutter({ lineNum, hasBreakpoint, isCurrentLine, onToggle }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={() => onToggle(lineNum)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 48,
        minWidth: 48,
        textAlign: "right",
        paddingRight: 8,
        fontSize: 11,
        fontFamily: T.fontMono,
        color: isCurrentLine ? T.amber : T.txt3,
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 4,
      }}
    >
      {/* Breakpoint dot */}
      {(hasBreakpoint || hov) && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: hasBreakpoint ? T.red : `${T.red}50`,
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
        />
      )}
      <span>{lineNum}</span>
    </div>
  );
}

function SourceLine({ lineNum, text, hasBreakpoint, isCurrentLine, onToggleBreakpoint, highlight }) {
  const tokens = useMemo(() => highlight(text), [text, highlight]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        minHeight: 20,
        background: isCurrentLine
          ? `${T.amber}18`
          : hasBreakpoint
          ? `${T.red}0C`
          : "transparent",
        borderLeft: isCurrentLine ? `2px solid ${T.amber}` : "2px solid transparent",
      }}
    >
      <BreakpointGutter
        lineNum={lineNum}
        hasBreakpoint={hasBreakpoint}
        isCurrentLine={isCurrentLine}
        onToggle={onToggleBreakpoint}
      />
      <div
        style={{
          flex: 1,
          fontFamily: T.fontMono,
          fontSize: 12,
          lineHeight: "20px",
          whiteSpace: "pre",
          overflow: "hidden",
          paddingRight: 12,
        }}
      >
        {tokens.map((tok, i) => (
          <span key={i} style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : 400 }}>
            {tok.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function VariableRow({ name, value, type }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.4fr 0.6fr",
        gap: 6,
        padding: "3px 10px",
        fontSize: 11,
        fontFamily: T.fontMono,
        background: hov ? T.bg3 : "transparent",
        borderRadius: 3,
        cursor: "default",
      }}
    >
      <span style={{ color: T.cyan, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <span style={{ color: T.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <span style={{ color: T.txt3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {type}
      </span>
    </div>
  );
}

function StackFrame({ frame, isActive, onClick }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: T.fontMono,
        cursor: "pointer",
        background: isActive ? `${T.blue}18` : hov ? T.bg3 : "transparent",
        borderLeft: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
      }}
    >
      <div style={{ color: isActive ? T.blue : T.txt, fontWeight: isActive ? 600 : 400 }}>
        {frame.fn}
      </div>
      <div style={{ color: T.txt3, fontSize: 10, marginTop: 1 }}>
        {frame.file}:{frame.line}
      </div>
    </div>
  );
}

function WatchItem({ expression, value, onRemove }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 10px",
        fontSize: 11,
        fontFamily: T.fontMono,
        background: hov ? T.bg3 : "transparent",
        borderRadius: 3,
      }}
    >
      <div style={{ flex: 1, overflow: "hidden" }}>
        <span style={{ color: T.purple }}>{expression}</span>
        <span style={{ color: T.txt3 }}> = </span>
        <span style={{ color: T.txt }}>{value ?? "not available"}</span>
      </div>
      {hov && (
        <span
          onClick={onRemove}
          style={{ color: T.red, cursor: "pointer", marginLeft: 6, fontSize: 13, fontWeight: 700, lineHeight: 1 }}
        >
          x
        </span>
      )}
    </div>
  );
}

function ConsoleEntry({ entry }) {
  const color = entry.type === "error" ? T.red
    : entry.type === "warn" ? T.amber
    : entry.type === "info" ? T.cyan
    : entry.type === "input" ? T.purple
    : T.txt2;

  const levelTag = entry.type === "error" ? "ERR"
    : entry.type === "warn" ? "WRN"
    : entry.type === "info" ? "INF"
    : entry.type === "input" ? null
    : null;

  const ts = entry.ts
    ? new Date(entry.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "3px 10px",
      fontSize: 11,
      fontFamily: T.fontMono,
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      borderBottom: `1px solid ${T.border}08`,
      background: entry.type === "error" ? `${T.red}08` : entry.type === "warn" ? `${T.amber}06` : "transparent",
    }}>
      {ts && (
        <span style={{ color: T.txt3, fontSize: 10, flexShrink: 0, minWidth: 58, fontVariantNumeric: "tabular-nums" }}>
          {ts}
        </span>
      )}
      {levelTag && (
        <span style={{
          color,
          fontSize: 9,
          fontWeight: 700,
          flexShrink: 0,
          minWidth: 26,
          letterSpacing: 0.3,
        }}>
          {levelTag}
        </span>
      )}
      <span style={{ color, flex: 1 }}>
        {entry.type === "input" && <span style={{ color: T.txt3 }}>&gt; </span>}
        {entry.text}
      </span>
    </div>
  );
}

// ── Collapsible section wrapper ─────────────────────────────────────────────
function CollapsibleSection({ title, accent, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          height: 28,
          cursor: "pointer",
          userSelect: "none",
          background: T.bg1,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: T.txt,
          fontFamily: T.fontUI,
        }}
      >
        <span style={{
          display: "inline-block",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
          fontSize: 9,
          color: T.txt3,
        }}>
          &#9654;
        </span>
        {accent && <span style={{ width: 3, height: 14, background: accent, borderRadius: 2 }} />}
        <span>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 10, color: T.txt2, background: T.bg3, padding: "0 5px", borderRadius: 8, fontWeight: 500 }}>
            {count}
          </span>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────────────────
function ToolbarBtn({ icon, label, onClick, disabled, active, color }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      title={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 5,
        background: active ? `${T.blue}28` : hov && !disabled ? T.bg4 : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "background 0.15s, opacity 0.15s",
        color: color || T.txt,
        outline: "none",
        padding: 0,
      }}
    >
      {icon}
    </button>
  );
}

// ── Main ScreenDebugger ─────────────────────────────────────────────────────
function ScreenDebugger() {
  const {
    workingDir,
    activeFile,
    openFiles,
    debugSession,
    setDebugSession,
    runConfigs,
    activeConfig,
  } = useShinra();

  // Source content
  const [sourceContent, setSourceContent] = useState(null);
  const [sourceLines, setSourceLines] = useState([]);
  const [sourceError, setSourceError] = useState(null);

  // Breakpoints: { [filePath]: Set<lineNumber> }
  const [breakpointMap, setBreakpointMap] = useState(loadBreakpoints);

  // Debug state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);

  // Variables panel
  const [variables, setVariables] = useState([]);

  // Call stack
  const [callStack, setCallStack] = useState([]);
  const [activeFrame, setActiveFrame] = useState(0);

  // Watch expressions
  const [watches, setWatches] = useState([]);
  const [watchInput, setWatchInput] = useState("");

  // Console
  const [consoleEntries, setConsoleEntries] = useState(() => {
    const now = Date.now();
    return [
      { text: "Debugger attached to process 14892", type: "info", ts: now - 12000 },
      { text: "Loaded source map for /src/index.ts", type: "output", ts: now - 11500 },
      { text: "Breakpoint set at line 42 in app.ts", type: "info", ts: now - 10000 },
      { text: "Warning: Module 'fs' imported but unused", type: "warn", ts: now - 8500 },
      { text: "Server listening on http://localhost:3000", type: "output", ts: now - 6000 },
      { text: "TypeError: Cannot read property 'id' of undefined", type: "error", ts: now - 3200 },
      { text: "  at processRequest (app.ts:42:18)", type: "error", ts: now - 3200 },
      { text: "Connection pool: 3/10 active connections", type: "info", ts: now - 1500 },
    ];
  });
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(true);

  // Config selector
  const [selectedConfigIdx, setSelectedConfigIdx] = useState(0);

  // Refs
  const consoleEndRef = useRef(null);
  const sourceScrollRef = useRef(null);

  // ── Load file content when activeFile changes ─────────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setSourceContent(null);
      setSourceLines([]);
      setSourceError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await window.akatsuki.shinra.readFile(activeFile);
        if (cancelled) return;
        if (result.error) {
          setSourceError(result.error);
          setSourceContent(null);
          setSourceLines([]);
        } else {
          setSourceContent(result.content);
          setSourceLines(result.content.split("\n"));
          setSourceError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSourceError(e.message);
          setSourceContent(null);
          setSourceLines([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // ── Persist breakpoints ───────────────────────────────────────────────────
  useEffect(() => {
    saveBreakpoints(breakpointMap);
  }, [breakpointMap]);

  // ── Auto-scroll console ───────────────────────────────────────────────────
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleEntries]);

  // ── Breakpoint toggle ─────────────────────────────────────────────────────
  const toggleBreakpoint = useCallback((lineNum) => {
    if (!activeFile) return;
    setBreakpointMap((prev) => {
      const next = { ...prev };
      const set = new Set(prev[activeFile] || []);
      if (set.has(lineNum)) {
        set.delete(lineNum);
      } else {
        set.add(lineNum);
      }
      if (set.size === 0) {
        delete next[activeFile];
      } else {
        next[activeFile] = set;
      }
      return next;
    });
  }, [activeFile]);

  // ── Get breakpoints for current file ──────────────────────────────────────
  const currentBreakpoints = useMemo(() => {
    if (!activeFile || !breakpointMap[activeFile]) return new Set();
    return breakpointMap[activeFile];
  }, [activeFile, breakpointMap]);

  // ── Append to console ─────────────────────────────────────────────────────
  const appendConsole = useCallback((text, type = "output") => {
    setConsoleEntries((prev) => [...prev, { text, type, ts: Date.now() }]);
  }, []);

  // ── Run program ───────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    // Determine what to run
    let cmd = null;
    let cwd = workingDir || undefined;
    let label = "";

    // Check if there's a selected run config
    const config = runConfigs[selectedConfigIdx];
    if (config && config.cmd) {
      cmd = config.cmd;
      cwd = config.cwd || cwd;
      label = config.name || config.cmd;
    } else if (activeFile) {
      // Detect from active file extension
      const runner = detectRunner(activeFile);
      if (!runner) {
        appendConsole(`Cannot determine how to run: ${activeFile}`, "error");
        return;
      }
      cmd = `${runner.cmd} "${activeFile}"`;
      label = `${runner.label}: ${activeFile.split("/").pop()}`;
    } else {
      appendConsole("No file or run configuration selected.", "error");
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    setCurrentLine(null);
    setVariables([]);
    setCallStack([]);

    const session = { name: label, startTime: Date.now(), cmd };
    setDebugSession(session);
    appendConsole(`--- Running: ${cmd} ---`, "info");

    try {
      const result = await window.akatsuki.shinra.runCommand({ cmd, cwd });

      if (result.stdout) {
        // Split stdout into lines for cleaner display
        const lines = result.stdout.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            appendConsole(line, "output");
          }
        }
      }
      if (result.stderr) {
        const lines = result.stderr.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            appendConsole(line, "error");
          }
        }
      }

      appendConsole(
        `--- Process exited with code ${result.exitCode ?? 0} ---`,
        result.exitCode === 0 ? "info" : "error"
      );
    } catch (e) {
      appendConsole(`Execution failed: ${e.message}`, "error");
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      setDebugSession(null);
      setCurrentLine(null);
    }
  }, [workingDir, activeFile, runConfigs, selectedConfigIdx, setDebugSession, appendConsole]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setDebugSession(null);
    setCurrentLine(null);
    setVariables([]);
    setCallStack([]);
    appendConsole("--- Session stopped ---", "info");
  }, [setDebugSession, appendConsole]);

  // ── Pause / Resume ────────────────────────────────────────────────────────
  const handlePauseResume = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // ── Step Over / Into / Out (visual simulation) ────────────────────────────
  const handleStepOver = useCallback(() => {
    if (!sourceLines.length) return;
    setCurrentLine((prev) => {
      const next = prev === null ? 1 : Math.min(prev + 1, sourceLines.length);
      return next;
    });
    setIsPaused(true);
    if (!isRunning) {
      setIsRunning(true);
      setDebugSession({ name: activeFile?.split("/").pop() || "debug", startTime: Date.now() });
    }
  }, [sourceLines, isRunning, activeFile, setDebugSession]);

  const handleStepInto = useCallback(() => {
    handleStepOver();
  }, [handleStepOver]);

  const handleStepOut = useCallback(() => {
    setCurrentLine(null);
    setIsPaused(false);
  }, []);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    handleStop();
    setTimeout(() => handleRun(), 100);
  }, [handleStop, handleRun]);

  // ── Debugger keyboard shortcuts (F5/F10/F11) ─────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Only intercept when the debugger screen is active (no text inputs focused)
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "F5") {
        e.preventDefault();
        if (e.shiftKey) { handleStop(); }
        else if (isRunning) { handlePauseResume(); }
        else { handleRun(); }
      } else if (e.key === "F10") {
        e.preventDefault();
        handleStepOver();
      } else if (e.key === "F11") {
        e.preventDefault();
        if (e.shiftKey) { handleStepOut(); }
        else { handleStepInto(); }
      } else if (e.key === "F6") {
        e.preventDefault();
        handlePauseResume();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRunning, handleRun, handleStop, handlePauseResume, handleStepOver, handleStepInto, handleStepOut]);

  // ── Watch expression eval ─────────────────────────────────────────────────
  const evaluateWatch = useCallback(async (expr) => {
    if (!workingDir) return "—";
    try {
      const result = await window.akatsuki.shinra.runCommand({
        cmd: `node -e "console.log(JSON.stringify(${expr}))"`,
        cwd: workingDir,
      });
      return result.stdout?.trim() || result.stderr?.trim() || "undefined";
    } catch {
      return "error";
    }
  }, [workingDir]);

  const evalAllWatches = useCallback(async () => {
    const updated = await Promise.all(
      watches.map(async (w) => ({ ...w, value: await evaluateWatch(w.expression) }))
    );
    setWatches(updated);
  }, [watches, evaluateWatch]);

  // Auto-eval watches when paused
  useEffect(() => {
    if (isPaused && watches.length > 0) {
      evalAllWatches();
    }
  }, [isPaused]);

  // ── Console eval ──────────────────────────────────────────────────────────
  const handleConsoleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const expr = consoleInput.trim();
    if (!expr) return;
    setConsoleInput("");
    appendConsole(expr, "input");

    try {
      const result = await window.akatsuki.shinra.runCommand({
        cmd: expr,
        cwd: workingDir || undefined,
      });
      if (result.stdout) appendConsole(result.stdout.trimEnd(), "output");
      if (result.stderr) appendConsole(result.stderr.trimEnd(), "error");
    } catch (e) {
      appendConsole(`Error: ${e.message}`, "error");
    }
  }, [consoleInput, workingDir, appendConsole]);

  // ── Add watch expression ──────────────────────────────────────────────────
  const handleAddWatch = useCallback((e) => {
    e.preventDefault();
    const expr = watchInput.trim();
    if (!expr) return;
    setWatches((prev) => [...prev, { expression: expr, value: null }]);
    setWatchInput("");
  }, [watchInput]);

  const removeWatch = useCallback((idx) => {
    setWatches((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Highlight function (memoized) ─────────────────────────────────────────
  const highlight = useCallback((text) => highlightTS(text), []);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!activeFile && !openFiles.length) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.fontUI,
          color: T.txt3,
          gap: 12,
        }}
      >
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={T.txt3} strokeWidth={1.2}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.txt2 }}>No File Open</div>
        <div style={{ fontSize: 12 }}>Open a file in the editor to start debugging</div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="screen-enter"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: T.fontUI,
      }}
    >
      {/* ── Debug Toolbar ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 12px",
          height: 40,
          minHeight: 40,
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {/* Control buttons */}
        <ToolbarBtn
          icon={<PlayIcon color={isRunning && !isPaused ? T.txt3 : T.green} />}
          label={isPaused ? "Resume (F5)" : "Run (F5)"}
          onClick={isPaused ? handlePauseResume : handleRun}
          disabled={isRunning && !isPaused}
          color={T.green}
        />
        <ToolbarBtn
          icon={<PauseIcon color={T.amber} />}
          label="Pause (F6)"
          onClick={handlePauseResume}
          disabled={!isRunning || isPaused}
          color={T.amber}
        />

        <div style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />

        <ToolbarBtn
          icon={
            <StepSvg color={!isRunning ? T.txt3 : T.txt}>
              <polyline points="2,8 14,8" />
              <polyline points="10,5 13,8 10,11" />
              <circle cx="8" cy="4" r="1.5" fill={!isRunning ? T.txt3 : T.txt} stroke="none" />
            </StepSvg>
          }
          label="Step Over (F10)"
          onClick={handleStepOver}
        />
        <ToolbarBtn
          icon={
            <StepSvg color={!isRunning ? T.txt3 : T.txt}>
              <polyline points="8,2 8,11" />
              <polyline points="5,8 8,11 11,8" />
              <line x1="3" y1="14" x2="13" y2="14" />
            </StepSvg>
          }
          label="Step Into (F11)"
          onClick={handleStepInto}
        />
        <ToolbarBtn
          icon={
            <StepSvg color={!isRunning ? T.txt3 : T.txt}>
              <polyline points="8,14 8,5" />
              <polyline points="5,8 8,5 11,8" />
              <line x1="3" y1="2" x2="13" y2="2" />
            </StepSvg>
          }
          label="Step Out (Shift+F11)"
          onClick={handleStepOut}
          disabled={!isRunning}
        />

        <div style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />

        <ToolbarBtn
          icon={
            <StepSvg color={T.green}>
              <path d="M2 8a5 5 0 1 1 1.5 3.5" fill="none" />
              <polyline points="2,14 2,10 6,10" fill="none" />
            </StepSvg>
          }
          label="Restart (Ctrl+Shift+F5)"
          onClick={handleRestart}
          disabled={!isRunning}
          color={T.green}
        />
        <ToolbarBtn
          icon={<StopIcon color={T.red} />}
          label="Stop (Shift+F5)"
          onClick={handleStop}
          disabled={!isRunning}
          color={T.red}
        />

        <div style={{ flex: 1 }} />

        {/* Run config selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isRunning && (
            <Badge style={{ background: `${T.green}18`, color: T.green, border: `1px solid ${T.green}40` }}>
              {isPaused ? "PAUSED" : "RUNNING"}
            </Badge>
          )}
          <select
            value={selectedConfigIdx}
            onChange={(e) => setSelectedConfigIdx(Number(e.target.value))}
            style={{
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              borderRadius: 5,
              color: T.txt,
              fontSize: 11,
              fontFamily: T.fontUI,
              padding: "3px 8px",
              height: 26,
              outline: "none",
              cursor: "pointer",
              maxWidth: 200,
            }}
          >
            {runConfigs.length === 0 && (
              <option value={0}>
                {activeFile ? `Run: ${activeFile.split("/").pop()}` : "No configuration"}
              </option>
            )}
            {runConfigs.map((cfg, i) => (
              <option key={i} value={i}>
                {cfg.name || cfg.cmd}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── APM Metric Cards ────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        background: T.bg1,
        borderBottom: `1px solid ${T.border}`,
        overflowX: "auto",
      }}>
        <StatCard label="Heap Usage" value="72.4" unit="MB" color={T.blue} sparkData={SPARKLINE_DATA.heap} />
        <StatCard label="CPU Usage" value="34.2" unit="%" color={T.green} sparkData={SPARKLINE_DATA.cpu} />
        <StatCard label="Event Loop Delay" value="1.8" unit="ms" color={T.amber} sparkData={SPARKLINE_DATA.eventLoop} />
        <StatCard label="Active Handles" value="42" unit="" color={T.purple} sparkData={SPARKLINE_DATA.handles} />
      </div>

      {/* ── Main content area ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Source Panel (left) ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Performance Timeline */}
          <div style={{ padding: "10px 12px 0", background: T.bg1 }}>
            <PerformanceTimeline />
          </div>

          {/* File tab bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 30,
              minHeight: 30,
              background: T.bg2,
              borderBottom: `1px solid ${T.border}`,
              paddingLeft: 4,
              overflow: "hidden",
            }}
          >
            {activeFile && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: "100%",
                  background: T.bg0,
                  borderTop: `2px solid ${T.amber}`,
                  fontSize: 11,
                  fontFamily: T.fontUI,
                  color: T.txt,
                }}
              >
                <span style={{ color: T.txt3, fontSize: 10 }}>
                  {detectRunner(activeFile)?.label || "File"}
                </span>
                <span>{activeFile.split("/").pop()}</span>
                {currentBreakpoints.size > 0 && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: T.red,
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Source code area */}
          <div
            ref={sourceScrollRef}
            style={{
              flex: 1,
              overflow: "auto",
              background: T.bg0,
            }}
          >
            {sourceError ? (
              <div
                style={{
                  padding: 20,
                  color: T.red,
                  fontSize: 12,
                  fontFamily: T.fontMono,
                }}
              >
                Error loading file: {sourceError}
              </div>
            ) : sourceLines.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  color: T.txt3,
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 40,
                }}
              >
                Loading...
              </div>
            ) : (
              <div style={{ paddingTop: 2, paddingBottom: 20 }}>
                {sourceLines.map((text, idx) => {
                  const lineNum = idx + 1;
                  return (
                    <SourceLine
                      key={lineNum}
                      lineNum={lineNum}
                      text={text}
                      hasBreakpoint={currentBreakpoints.has(lineNum)}
                      isCurrentLine={currentLine === lineNum}
                      onToggleBreakpoint={toggleBreakpoint}
                      highlight={highlight}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────── */}
        <div
          style={{
            width: 300,
            minWidth: 300,
            borderLeft: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: T.bg1,
          }}
        >
          <div style={{ flex: 1, overflow: "auto" }}>
            {/* Variables section */}
            <CollapsibleSection title="Variables" accent={T.cyan} count={variables.length}>
              {variables.length === 0 ? (
                <div
                  style={{
                    padding: "12px 10px",
                    fontSize: 11,
                    color: T.txt3,
                    fontFamily: T.fontUI,
                    textAlign: "center",
                  }}
                >
                  {isRunning
                    ? "No variables in current scope"
                    : "Run a program to inspect variables"}
                </div>
              ) : (
                <div style={{ padding: "4px 0" }}>
                  {/* Column headers */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1.4fr 0.6fr",
                      gap: 6,
                      padding: "2px 10px 4px",
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: T.txt3,
                      fontFamily: T.fontUI,
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    <span>Name</span>
                    <span>Value</span>
                    <span>Type</span>
                  </div>
                  {variables.map((v, i) => (
                    <VariableRow key={i} name={v.name} value={v.value} type={v.type} />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Call Stack section */}
            <CollapsibleSection title="Call Stack" accent={T.blue} count={callStack.length}>
              {callStack.length === 0 ? (
                <div
                  style={{
                    padding: "12px 10px",
                    fontSize: 11,
                    color: T.txt3,
                    fontFamily: T.fontUI,
                    textAlign: "center",
                  }}
                >
                  {isRunning ? "No call stack available" : "Not debugging"}
                </div>
              ) : (
                <div style={{ padding: "4px 0" }}>
                  {callStack.map((frame, i) => (
                    <StackFrame
                      key={i}
                      frame={frame}
                      isActive={i === activeFrame}
                      onClick={() => setActiveFrame(i)}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Watch Expressions section */}
            <CollapsibleSection title="Watch" accent={T.purple} count={watches.length}>
              <div style={{ padding: "4px 0" }}>
                {watches.map((w, i) => (
                  <WatchItem
                    key={i}
                    expression={w.expression}
                    value={w.value}
                    onRemove={() => removeWatch(i)}
                  />
                ))}
                <form
                  onSubmit={handleAddWatch}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    gap: 6,
                  }}
                >
                  <input
                    type="text"
                    placeholder="Add expression..."
                    value={watchInput}
                    onChange={(e) => setWatchInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: T.bg3,
                      border: `1px solid ${T.border2}`,
                      borderRadius: 4,
                      color: T.txt,
                      fontSize: 11,
                      fontFamily: T.fontMono,
                      padding: "3px 8px",
                      outline: "none",
                      height: 24,
                    }}
                  />
                  <Btn
                    variant="ghost"
                    onClick={handleAddWatch}
                    style={{ height: 24, padding: "0 8px", fontSize: 10 }}
                  >
                    +
                  </Btn>
                </form>
              </div>
            </CollapsibleSection>

            {/* Breakpoints summary */}
            <CollapsibleSection title="Breakpoints" accent={T.red} count={currentBreakpoints.size} defaultOpen={false}>
              <div style={{ padding: "4px 0" }}>
                {Object.entries(breakpointMap).map(([file, lineSet]) =>
                  [...lineSet].sort((a, b) => a - b).map((ln) => {
                    const fileName = file.split("/").pop();
                    const isCurrentFile = file === activeFile;
                    return (
                      <div
                        key={`${file}:${ln}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          fontSize: 11,
                          fontFamily: T.fontMono,
                          color: isCurrentFile ? T.txt : T.txt2,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: T.red,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fileName}
                        </span>
                        <span style={{ color: T.txt3 }}>:{ln}</span>
                      </div>
                    );
                  })
                )}
                {Object.keys(breakpointMap).length === 0 && (
                  <div
                    style={{
                      padding: "12px 10px",
                      fontSize: 11,
                      color: T.txt3,
                      fontFamily: T.fontUI,
                      textAlign: "center",
                    }}
                  >
                    Click the gutter to add breakpoints
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* ── Debug Console (bottom) ─────────────────────────────────────── */}
      <div
        style={{
          height: consoleOpen ? 160 : 28,
          minHeight: consoleOpen ? 160 : 28,
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          background: T.bg1,
          transition: "height 0.2s ease, min-height 0.2s ease",
        }}
      >
        {/* Console header */}
        <div
          onClick={() => setConsoleOpen(!consoleOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            height: 28,
            minHeight: 28,
            cursor: "pointer",
            userSelect: "none",
            background: T.bg2,
            borderBottom: consoleOpen ? `1px solid ${T.border}` : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                transform: consoleOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                fontSize: 9,
                color: T.txt3,
              }}
            >
              &#9654;
            </span>
            <div style={{ width: 3, height: 14, background: T.amber, borderRadius: 2 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: T.txt,
                fontFamily: T.fontUI,
              }}
            >
              Debug Console
            </span>
            {consoleEntries.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  color: T.txt2,
                  background: T.bg3,
                  padding: "0 5px",
                  borderRadius: 8,
                  fontWeight: 500,
                  fontFamily: T.fontUI,
                }}
              >
                {consoleEntries.length}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setConsoleEntries([]);
              }}
              style={{
                fontSize: 10,
                color: T.txt3,
                cursor: "pointer",
                fontFamily: T.fontUI,
                padding: "2px 6px",
                borderRadius: 3,
              }}
              title="Clear console"
            >
              Clear
            </span>
          </div>
        </div>

        {/* Console content */}
        {consoleOpen && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg0 }}>
            <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
              {consoleEntries.length === 0 ? (
                <div
                  style={{
                    padding: "16px 10px",
                    fontSize: 11,
                    color: T.txt3,
                    fontFamily: T.fontMono,
                    textAlign: "center",
                  }}
                >
                  Debug console ready. Run a program or type a command below.
                </div>
              ) : (
                consoleEntries.map((entry, i) => (
                  <ConsoleEntry key={i} entry={entry} />
                ))
              )}
              <div ref={consoleEndRef} />
            </div>

            {/* Console input */}
            <form
              onSubmit={handleConsoleSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                borderTop: `1px solid ${T.border}`,
                background: T.bg0,
              }}
            >
              <span
                style={{
                  padding: "0 8px",
                  fontSize: 11,
                  fontFamily: T.fontMono,
                  color: T.purple,
                  userSelect: "none",
                }}
              >
                &gt;
              </span>
              <input
                type="text"
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                placeholder="Evaluate expression or run command..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: T.txt,
                  fontSize: 11,
                  fontFamily: T.fontMono,
                  padding: "6px 0",
                  outline: "none",
                }}
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScreenDebugger;

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Input } from "../components";
import { useShinra, highlightTS } from "./ShinraApp";

// ── File extension → icon / color mapping ───────────────────────────────────
const EXT_META = {
  js:   { icon: "JS", color: T.amber },
  jsx:  { icon: "⚛",  color: T.cyan },
  ts:   { icon: "TS", color: T.blue },
  tsx:  { icon: "⚛",  color: T.blue },
  json: { icon: "{}",  color: T.amber },
  md:   { icon: "M",  color: T.txt2 },
  css:  { icon: "#",  color: T.purple },
  scss: { icon: "#",  color: T.purple },
  html: { icon: "<>", color: T.red },
  py:   { icon: "Py", color: T.green },
  rs:   { icon: "Rs", color: T.red },
  go:   { icon: "Go", color: T.cyan },
  sh:   { icon: "$",  color: T.green },
  yml:  { icon: "Y",  color: T.red },
  yaml: { icon: "Y",  color: T.red },
  toml: { icon: "T",  color: T.amber },
  lock: { icon: "🔒", color: T.txt3 },
  svg:  { icon: "◇",  color: T.amber },
  png:  { icon: "▣",  color: T.green },
  jpg:  { icon: "▣",  color: T.green },
  gif:  { icon: "▣",  color: T.green },
  env:  { icon: "•",  color: T.amber },
  gitignore: { icon: "G", color: T.red },
};

function getExtMeta(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return EXT_META[ext] || { icon: "·", color: T.txt3 };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function basename(p) {
  return p ? p.split("/").pop() || p : "";
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ── FileTreeItem (extracted to avoid hooks-in-map) ──────────────────────────
function FileTreeItem({ entry, depth, onFileClick, activeFile }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleDir = useCallback(async () => {
    if (!entry.isDir) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (children === null) {
      setLoading(true);
      try {
        const res = await window.akatsuki.shinra.readDir(entry.path);
        setChildren(sortEntries(res.entries || []));
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }
    setExpanded(true);
  }, [entry, expanded, children]);

  const handleClick = useCallback(() => {
    if (entry.isDir) {
      toggleDir();
    } else {
      onFileClick(entry.path);
    }
  }, [entry, toggleDir, onFileClick]);

  const isActive = !entry.isDir && entry.path === activeFile;
  const meta = entry.isDir ? null : getExtMeta(entry.name);
  const indent = 12 + depth * 16;

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 26,
          paddingLeft: indent,
          paddingRight: 8,
          cursor: "pointer",
          background: isActive ? `${T.blue}18` : "transparent",
          borderLeft: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
          fontSize: 12,
          fontFamily: T.fontUI,
          color: isActive ? T.txt : T.txt2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "background 0.1s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = `${T.bg3}80`;
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {entry.isDir ? (
          <>
            <span style={{ fontSize: 10, color: T.txt3, width: 12, textAlign: "center", flexShrink: 0 }}>
              {loading ? "…" : expanded ? "▾" : "▸"}
            </span>
            <span style={{ fontSize: 11, flexShrink: 0 }}>📁</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: meta.color,
              width: 18,
              textAlign: "center",
              flexShrink: 0,
              fontFamily: T.fontMono,
            }}>
              {meta.icon}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
          </>
        )}
      </div>

      {entry.isDir && expanded && children && children.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onFileClick={onFileClick}
          activeFile={activeFile}
        />
      ))}
    </>
  );
}

// ── EditorTab (extracted to avoid hooks-in-map) ─────────────────────────────
function EditorTab({ filePath, isActive, onSelect, onClose, modified }) {
  const [hov, setHov] = useState(false);
  const name = basename(filePath);
  const meta = getExtMeta(name);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: "100%",
        padding: "0 12px",
        cursor: "pointer",
        background: isActive ? T.bg1 : hov ? T.bg2 : "transparent",
        borderRight: `1px solid ${T.border}`,
        borderBottom: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
        fontSize: 11,
        fontFamily: T.fontUI,
        color: isActive ? T.txt : T.txt2,
        whiteSpace: "nowrap",
        userSelect: "none",
        position: "relative",
      }}
    >
      <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, fontFamily: T.fontMono }}>
        {meta.icon}
      </span>
      <span>{name}</span>
      {modified && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, flexShrink: 0 }} />
      )}
      <span
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          fontSize: 12,
          color: T.txt3,
          marginLeft: 2,
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          transition: "background 0.1s, color 0.1s",
          ...(hov || isActive ? {} : { opacity: 0 }),
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.bg4; e.currentTarget.style.color = T.txt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.txt3; }}
      >
        ×
      </span>
    </div>
  );
}

// ── CodeLine (extracted to avoid hooks-in-map) ──────────────────────────────
function CodeLine({ lineNum, text, gutterWidth }) {
  const tokens = useMemo(() => highlightTS(text), [text]);

  return (
    <div style={{ display: "flex", minHeight: 20, lineHeight: "20px" }}>
      <span style={{
        width: gutterWidth,
        minWidth: gutterWidth,
        textAlign: "right",
        paddingRight: 12,
        color: T.txt3,
        fontSize: 12,
        fontFamily: T.fontMono,
        userSelect: "none",
        flexShrink: 0,
      }}>
        {lineNum}
      </span>
      <span style={{ flex: 1, whiteSpace: "pre", fontSize: 13, fontFamily: T.fontMono, tabSize: 2 }}>
        {tokens.map((tok, i) => (
          <span key={i} style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : 400 }}>{tok.text}</span>
        ))}
      </span>
    </div>
  );
}

// ── TerminalOutput (extracted to avoid hooks-in-map) ─────────────────────────
function TerminalOutput({ text, type }) {
  const color = type === "stderr" ? T.red : T.txt2;
  return (
    <span style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{text}</span>
  );
}

// ── AI Suggestion Bubble ────────────────────────────────────────────────────
function AISuggestion({ text, onApply, onDismiss }) {
  return (
    <div style={{
      margin: "6px 0", padding: "8px 12px", borderRadius: 8,
      background: `${T.purple}12`, border: `1px solid ${T.purple}30`,
      fontSize: 12, fontFamily: T.fontUI, lineHeight: 1.6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.purple }}>AI Assistant</span>
      </div>
      <div style={{ color: T.txt2, fontFamily: T.fontMono, fontSize: 11, whiteSpace: "pre-wrap" }}>{text}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {onApply && (
          <Btn variant="ghost" onClick={onApply} style={{ height: 22, fontSize: 10, padding: "0 10px", color: T.purple, border: `1px solid ${T.purple}40` }}>
            Run Suggestion
          </Btn>
        )}
        <Btn variant="ghost" onClick={onDismiss} style={{ height: 22, fontSize: 10, padding: "0 8px" }}>
          Dismiss
        </Btn>
      </div>
    </div>
  );
}

// ── Minimap ─────────────────────────────────────────────────────────────────
function Minimap({ lines, scrollTop, visibleLines, totalHeight, onSeek }) {
  const canvasRef = useRef(null);
  const SCALE = 2; // pixels per line in minimap
  const WIDTH = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lines.length) return;
    const ctx = canvas.getContext("2d");
    const h = lines.length * SCALE;
    canvas.width = WIDTH;
    canvas.height = Math.min(h, 2000);
    ctx.fillStyle = T.bg1;
    ctx.fillRect(0, 0, WIDTH, canvas.height);

    lines.forEach((line, i) => {
      if (i * SCALE > canvas.height) return;
      const trimmed = line.trimStart();
      if (!trimmed) return;
      const indent = line.length - trimmed.length;
      const x = Math.min(indent * 1.5, 20);
      const w = Math.min(trimmed.length * 0.6, WIDTH - x - 2);
      // Color based on content
      let color = `${T.txt3}60`;
      if (/^\s*(import|export|from)\b/.test(line)) color = `${T.purple}50`;
      else if (/^\s*(function|class|const|let|var)\b/.test(line)) color = `${T.blue}60`;
      else if (/^\s*\/\//.test(line)) color = `${T.txt3}40`;
      else if (/^\s*(if|else|for|while|return|switch)\b/.test(line)) color = `${T.cyan}50`;
      else if (/["'`]/.test(line)) color = `${T.green}40`;
      ctx.fillStyle = color;
      ctx.fillRect(x, i * SCALE, Math.max(w, 3), SCALE - 0.5);
    });
  }, [lines]);

  // Viewport indicator
  const mapHeight = Math.min(lines.length * SCALE, 2000);
  const viewRatio = totalHeight > 0 ? mapHeight / totalHeight : 0;
  const viewTop = scrollTop * viewRatio;
  const viewH = Math.max(visibleLines * SCALE, 20);

  const handleClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const lineIdx = Math.floor(y / SCALE);
    if (onSeek) onSeek(lineIdx);
  }, [onSeek]);

  return (
    <div
      onClick={handleClick}
      style={{
        width: WIDTH,
        minWidth: WIDTH,
        background: T.bg1,
        borderLeft: `1px solid ${T.border}`,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <canvas ref={canvasRef} style={{ width: WIDTH, display: "block" }} />
      <div style={{
        position: "absolute",
        top: viewTop,
        left: 0,
        right: 0,
        height: viewH,
        background: `${T.blue}15`,
        border: `1px solid ${T.blue}30`,
        borderRadius: 1,
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ── Main ScreenEditor ───────────────────────────────────────────────────────
function ScreenEditor() {
  const {
    workingDir, setWorkingDir,
    openFiles, setOpenFiles,
    activeFile, setActiveFile,
    filePaletteOpen, setFilePaletteOpen,
  } = useShinra();

  // File tree state
  const [treeEntries, setTreeEntries] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Editor content
  const [fileContents, setFileContents] = useState({}); // path -> { content, original, modified }
  const [saving, setSaving] = useState(false);

  // Terminal state — persistent shell
  const [termOpen, setTermOpen] = useState(true);
  const [termOutput, setTermOutput] = useState(""); // raw terminal output
  const [termInput, setTermInput] = useState("");
  const [shellActive, setShellActive] = useState(false);
  const [cmdHistory, setCmdHistory] = useState(() => {
    try { const h = localStorage.getItem("shinra:cmd-history"); return h ? JSON.parse(h) : []; } catch { return []; }
  });
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Editor scroll state
  const editorRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [editorHeight, setEditorHeight] = useState(400);

  // ── Load tree when workingDir changes ─────────────────────────────────────
  useEffect(() => {
    if (!workingDir) {
      setTreeEntries([]);
      return;
    }
    let canceled = false;
    (async () => {
      setTreeLoading(true);
      try {
        const res = await window.akatsuki.shinra.readDir(workingDir);
        if (!canceled) setTreeEntries(sortEntries(res.entries || []));
      } catch {
        if (!canceled) setTreeEntries([]);
      }
      if (!canceled) setTreeLoading(false);
    })();
    return () => { canceled = true; };
  }, [workingDir]);

  // ── Open folder ───────────────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const res = await window.akatsuki.shinra.selectFolder();
      if (res && !res.canceled && res.path) {
        setWorkingDir(res.path);
        setOpenFiles([]);
        setActiveFile(null);
        setFileContents({});
      }
    } catch {}
  }, [setWorkingDir, setOpenFiles, setActiveFile]);

  // ── Open file in editor ───────────────────────────────────────────────────
  const handleFileClick = useCallback(async (filePath) => {
    // Add to open tabs if not already there
    setOpenFiles((prev) => {
      if (prev.includes(filePath)) return prev;
      return [...prev, filePath];
    });
    setActiveFile(filePath);

    // Load content if not cached
    if (!fileContents[filePath]) {
      try {
        const res = await window.akatsuki.shinra.readFile(filePath);
        setFileContents((prev) => ({
          ...prev,
          [filePath]: {
            content: res.content || "",
            original: res.content || "",
            size: res.size,
            modified: false,
          },
        }));
      } catch {
        setFileContents((prev) => ({
          ...prev,
          [filePath]: {
            content: "// Error reading file",
            original: "",
            size: 0,
            modified: false,
          },
        }));
      }
    }
  }, [fileContents, setOpenFiles, setActiveFile]);

  // ── Auto-load content when activeFile changes (e.g. opened from Search) ──
  useEffect(() => {
    if (!activeFile || fileContents[activeFile]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await window.akatsuki.shinra.readFile(activeFile);
        if (cancelled) return;
        setFileContents((prev) => ({
          ...prev,
          [activeFile]: {
            content: res.content || "",
            original: res.content || "",
            size: res.size,
            modified: false,
          },
        }));
      } catch {
        if (cancelled) return;
        setFileContents((prev) => ({
          ...prev,
          [activeFile]: {
            content: "// Error reading file",
            original: "",
            size: 0,
            modified: false,
          },
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile, fileContents]);

  // ── Close tab ─────────────────────────────────────────────────────────────
  const handleCloseTab = useCallback((filePath) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== filePath);
      if (filePath === activeFile) {
        setActiveFile(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
    setFileContents((prev) => {
      const copy = { ...prev };
      delete copy[filePath];
      return copy;
    });
  }, [activeFile, setOpenFiles, setActiveFile]);

  // ── Handle content edit ───────────────────────────────────────────────────
  const handleContentChange = useCallback((e) => {
    if (!activeFile) return;
    const newContent = e.target.value;
    setFileContents((prev) => ({
      ...prev,
      [activeFile]: {
        ...prev[activeFile],
        content: newContent,
        modified: newContent !== prev[activeFile]?.original,
      },
    }));
  }, [activeFile]);

  // ── Scroll parent to keep textarea cursor in view ─────────────────────────
  const handleEditorKeyDown = useCallback((e) => {
    // After key press, check if we need to scroll to keep cursor visible
    setTimeout(() => {
      const textarea = e.target;
      const scrollEl = editorRef.current;
      if (!textarea || !scrollEl) return;
      const cursorPos = textarea.selectionStart;
      const textBefore = (textarea.value || "").slice(0, cursorPos);
      const linesBefore = textBefore.split("\n").length - 1;
      const cursorY = linesBefore * 20; // 20px per line
      const viewTop = scrollEl.scrollTop;
      const viewBottom = viewTop + scrollEl.clientHeight;
      if (cursorY < viewTop + 40) {
        scrollEl.scrollTop = Math.max(0, cursorY - 40);
      } else if (cursorY + 24 > viewBottom - 40) {
        scrollEl.scrollTop = cursorY + 64 - scrollEl.clientHeight;
      }
    }, 0);
  }, []);

  // ── Save file (Cmd+S) ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeFile || !fileContents[activeFile]) return;
    const fc = fileContents[activeFile];
    if (!fc.modified) return;
    setSaving(true);
    try {
      await window.akatsuki.shinra.writeFile(activeFile, fc.content);
      setFileContents((prev) => ({
        ...prev,
        [activeFile]: {
          ...prev[activeFile],
          original: fc.content,
          modified: false,
        },
      }));
    } catch {}
    setSaving(false);
  }, [activeFile, fileContents]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘S — save
      if (mod && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // ⌘W — close active tab
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeFile) handleCloseTab(activeFile);
        return;
      }

      // ⌘1-9 — switch to tab by index
      if (mod && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (openFiles[idx]) {
          e.preventDefault();
          setActiveFile(openFiles[idx]);
        }
        return;
      }

      // Ctrl+` — toggle terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTermOpen((p) => !p);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleCloseTab, activeFile, openFiles, setActiveFile]);

  // ── File palette (⌘P): focus input when triggered ─────────────────────────
  const fileSearchRef = useRef(null);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [fileSearchOpen, setFileSearchOpen] = useState(false);

  useEffect(() => {
    if (filePaletteOpen) {
      setFileSearchOpen(true);
      setFilePaletteOpen(false);
      setTimeout(() => fileSearchRef.current?.focus(), 50);
    }
  }, [filePaletteOpen, setFilePaletteOpen]);

  // Flat list of all opened + recently seen files for palette
  const paletteFiles = useMemo(() => openFiles, [openFiles]);
  const filteredPalette = useMemo(() => {
    if (!fileSearchQuery.trim()) return paletteFiles;
    const q = fileSearchQuery.toLowerCase();
    return paletteFiles.filter((fp) => fp.toLowerCase().includes(q));
  }, [paletteFiles, fileSearchQuery]);

  // ── Track editor scroll for minimap ───────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setEditorHeight(el.clientHeight);
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);
    onResize();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [activeFile]);

  // ── Minimap seek (smooth) ─────────────────────────────────────────────────
  const handleMinimapSeek = useCallback((lineIdx) => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollTo({ top: lineIdx * 20, behavior: "smooth" });
  }, []);

  // ── Persistent shell session ──────────────────────────────────────────────
  const termScrollRef = useRef(null);
  const termInputRef = useRef(null);

  // Start shell when workingDir is available
  useEffect(() => {
    if (!workingDir) return;
    let mounted = true;

    (async () => {
      try {
        await window.akatsuki.shinra.shellDestroy();
        window.akatsuki.shinra.removeShellListeners();
      } catch {}

      window.akatsuki.shinra.onShellStdout((data) => {
        if (mounted) setTermOutput(prev => prev + data);
      });
      window.akatsuki.shinra.onShellStderr((data) => {
        if (mounted) setTermOutput(prev => prev + data);
      });
      window.akatsuki.shinra.onShellExit((code) => {
        if (mounted) {
          setTermOutput(prev => prev + `\n[Shell exited with code ${code}]\n`);
          setShellActive(false);
        }
      });

      try {
        const res = await window.akatsuki.shinra.shellCreate({ cwd: workingDir });
        if (mounted && res.ok) setShellActive(true);
      } catch {}
    })();

    return () => {
      mounted = false;
      try {
        window.akatsuki.shinra.removeShellListeners();
        window.akatsuki.shinra.shellDestroy();
      } catch {}
    };
  }, [workingDir]);

  // Auto-scroll terminal
  useEffect(() => {
    const el = termScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [termOutput, aiSuggestion]);

  // Terminal submit — send to persistent shell
  const handleTermSubmit = useCallback(async (e) => {
    e.preventDefault();
    const cmd = termInput.trim();
    if (!cmd || !shellActive) return;
    setTermInput("");
    setHistoryIdx(-1);
    setAiSuggestion(null);

    // Save to command history
    setCmdHistory(prev => {
      const next = [cmd, ...prev.filter(c => c !== cmd)].slice(0, 100);
      try { localStorage.setItem("shinra:cmd-history", JSON.stringify(next)); } catch {}
      return next;
    });

    // Write to shell stdin
    try {
      await window.akatsuki.shinra.shellWrite(cmd + "\n");
    } catch {
      setTermOutput(prev => prev + `[Error sending command]\n`);
    }
  }, [termInput, shellActive]);

  // Up/Down arrow for command history
  const handleTermKeyDown = useCallback((e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistoryIdx(prev => {
        const next = Math.min(prev + 1, cmdHistory.length - 1);
        if (cmdHistory[next]) setTermInput(cmdHistory[next]);
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistoryIdx(prev => {
        const next = Math.max(prev - 1, -1);
        setTermInput(next < 0 ? "" : (cmdHistory[next] || ""));
        return next;
      });
    } else if (e.key === "c" && e.ctrlKey) {
      // Ctrl+C — send SIGINT
      window.akatsuki.shinra.shellWrite("\x03");
    }
  }, [cmdHistory]);

  // AI assist — ask AI about the command or error
  const handleAIAssist = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiSuggestion(null);

    // Get recent terminal output (last 2000 chars)
    const recentOutput = termOutput.slice(-2000);
    const currentCmd = termInput.trim();

    try {
      const cfg = await window.akatsuki.config.load();
      const agent = (cfg.aiAgents || []).find(a => a.apiKey);
      if (!agent) {
        setAiSuggestion({ text: "No AI agent configured. Go to Settings to add an API key.", cmd: null });
        setAiLoading(false);
        return;
      }

      const system = "You are a terminal assistant. Help the user with their terminal commands. Be concise. If suggesting a command, put it on its own line prefixed with $. Context: macOS zsh terminal.";
      const userMsg = currentCmd
        ? `I want to run: "${currentCmd}"\n\nRecent terminal output:\n${recentOutput}\n\nHelp me with this command. If it looks wrong, suggest the correct one.`
        : `Here's my recent terminal output:\n${recentOutput}\n\nWhat should I do next? If there's an error, help me fix it.`;

      const res = await window.akatsuki.ai.chat({
        provider: agent.provider,
        apiKey: agent.apiKey,
        model: agent.model,
        system,
        messages: [{ role: "user", content: userMsg }],
      });

      if (res.error) {
        setAiSuggestion({ text: `Error: ${res.error}`, cmd: null });
      } else {
        // Extract suggested command if any (lines starting with $)
        const lines = (res.text || "").split("\n");
        const cmdLine = lines.find(l => l.trim().startsWith("$ ") || l.trim().startsWith("$\t"));
        const suggestedCmd = cmdLine ? cmdLine.trim().replace(/^\$\s*/, "") : null;
        setAiSuggestion({ text: res.text, cmd: suggestedCmd });
      }
    } catch (e) {
      setAiSuggestion({ text: `Failed: ${e.message}`, cmd: null });
    }
    setAiLoading(false);
  }, [termOutput, termInput, aiLoading]);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeContent = activeFile && fileContents[activeFile] ? fileContents[activeFile].content : "";
  const activeModified = activeFile && fileContents[activeFile] ? fileContents[activeFile].modified : false;
  const lines = useMemo(() => activeContent.split("\n"), [activeContent]);
  const gutterWidth = useMemo(() => Math.max(String(lines.length).length * 9 + 16, 40), [lines.length]);
  const visibleLines = Math.floor(editorHeight / 20);
  const totalHeight = lines.length * 20;

  const termPanelHeight = termOpen ? 180 : 28;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* ── File Tree Sidebar ──────────────────────────────────────────── */}
      <div style={{
        width: 240,
        minWidth: 240,
        display: "flex",
        flexDirection: "column",
        background: T.bg0,
        borderRight: `1px solid ${T.border}`,
        overflow: "hidden",
      }}>
        <PanelHeader title="Explorer" accent={T.blue}>
          {workingDir && (
            <span
              onClick={handleOpenFolder}
              style={{ fontSize: 13, cursor: "pointer", color: T.txt3, lineHeight: 1 }}
              title="Open another folder"
            >
              +
            </span>
          )}
        </PanelHeader>

        {!workingDir ? (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>📂</div>
            <div style={{ fontSize: 12, color: T.txt3, textAlign: "center", lineHeight: 1.6 }}>
              No folder open
            </div>
            <Btn variant="primary" onClick={handleOpenFolder} style={{ marginTop: 4 }}>
              Open Folder
            </Btn>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: 4, paddingBottom: 8 }}>
            {/* Working dir label */}
            <div style={{
              padding: "4px 12px 6px",
              fontSize: 10,
              fontWeight: 700,
              color: T.txt3,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {basename(workingDir)}
            </div>

            {treeLoading ? (
              <div style={{ padding: "12px 16px", fontSize: 11, color: T.txt3 }}>Loading...</div>
            ) : treeEntries.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 11, color: T.txt3 }}>Empty directory</div>
            ) : (
              treeEntries.map((entry) => (
                <FileTreeItem
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  onFileClick={handleFileClick}
                  activeFile={activeFile}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Editor Area ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* ── Tab Bar ──────────────────────────────────────────────────── */}
        <div style={{
          height: 34,
          minHeight: 34,
          display: "flex",
          alignItems: "stretch",
          background: T.bg2,
          borderBottom: `1px solid ${T.border}`,
          overflowX: "auto",
          overflowY: "hidden",
        }}>
          {openFiles.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
              No files open
            </div>
          ) : (
            openFiles.map((fp) => (
              <EditorTab
                key={fp}
                filePath={fp}
                isActive={fp === activeFile}
                onSelect={() => setActiveFile(fp)}
                onClose={() => handleCloseTab(fp)}
                modified={fileContents[fp]?.modified || false}
              />
            ))
          )}
          <div style={{ flex: 1 }} />
          {/* Save indicator */}
          {saving && (
            <div style={{ display: "flex", alignItems: "center", padding: "0 10px", fontSize: 10, color: T.txt3 }}>
              Saving...
            </div>
          )}
        </div>

        {/* ── Editor + Minimap ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {!activeFile ? (
            // Empty state
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: T.bg0,
            }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>⌨</div>
              <div style={{ fontSize: 13, color: T.txt3, fontFamily: T.fontUI }}>
                {workingDir ? "Select a file to start editing" : "Open a folder to get started"}
              </div>
              <div style={{ fontSize: 11, color: T.txt3, opacity: 0.6, fontFamily: T.fontUI }}>
                Cmd+S to save
              </div>
            </div>
          ) : (
            <>
              {/* Code editor */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", background: T.bg0 }}>
                {/* Breadcrumb bar */}
                <div style={{
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 4,
                  background: T.bg1,
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 11,
                  fontFamily: T.fontUI,
                  color: T.txt3,
                  overflow: "hidden",
                }}>
                  {activeFile.replace(workingDir || "", "").split("/").filter(Boolean).map((part, i, arr) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={{ color: T.txt3, opacity: 0.4, margin: "0 2px" }}>/</span>}
                      <span style={{ color: i === arr.length - 1 ? T.txt : T.txt3 }}>{part}</span>
                    </React.Fragment>
                  ))}
                  <div style={{ flex: 1 }} />
                  {activeModified && (
                    <Badge style={{ fontSize: 9, padding: "1px 6px" }}>Modified</Badge>
                  )}
                </div>

                {/* Scrollable code area with overlaid textarea */}
                <div
                  ref={editorRef}
                  style={{
                    position: "absolute",
                    top: 26,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflow: "auto",
                  }}
                >
                  {/* Highlighted display layer */}
                  <div style={{
                    position: "relative",
                    minHeight: "100%",
                    padding: "4px 0",
                  }}>
                    {lines.map((line, i) => (
                      <CodeLine
                        key={i}
                        lineNum={i + 1}
                        text={line}
                        gutterWidth={gutterWidth}
                      />
                    ))}
                  </div>

                  {/* Transparent textarea overlay for editing */}
                  <textarea
                    value={activeContent}
                    onChange={handleContentChange}
                    onKeyDown={handleEditorKeyDown}
                    spellCheck={false}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: gutterWidth,
                      right: 0,
                      bottom: 0,
                      width: `calc(100% - ${gutterWidth}px)`,
                      minHeight: "100%",
                      padding: "4px 0",
                      margin: 0,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "transparent",
                      caretColor: T.txt,
                      fontSize: 13,
                      fontFamily: T.fontMono,
                      lineHeight: "20px",
                      tabSize: 2,
                      whiteSpace: "pre",
                      resize: "none",
                      overflow: "hidden",
                      zIndex: 2,
                      letterSpacing: "normal",
                      wordSpacing: "normal",
                    }}
                  />
                </div>
              </div>

              {/* Minimap */}
              <Minimap
                lines={lines}
                scrollTop={scrollTop}
                visibleLines={visibleLines}
                totalHeight={totalHeight}
                onSeek={handleMinimapSeek}
              />
            </>
          )}
        </div>

        {/* ── Terminal Panel ────────────────────────────────────────────── */}
        <div style={{
          height: termPanelHeight,
          minHeight: termPanelHeight,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          borderTop: `1px solid ${T.border}`,
          transition: "height 0.15s ease",
        }}>
          {/* Terminal header */}
          <div
            onClick={() => setTermOpen((p) => !p)}
            style={{
              height: 28,
              minHeight: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              cursor: "pointer",
              userSelect: "none",
              background: T.bg2,
              borderBottom: termOpen ? `1px solid ${T.border}` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, background: T.green, borderRadius: 2 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase" }}>
                Terminal
              </span>
              {shellActive && (
                <span style={{ fontSize: 9, color: T.green, fontFamily: T.fontMono }}>zsh</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {termOpen && (
                <>
                  <span
                    onClick={(e) => { e.stopPropagation(); handleAIAssist(); }}
                    style={{
                      fontSize: 9, fontWeight: 700, color: aiLoading ? T.txt3 : T.purple,
                      cursor: "pointer", padding: "2px 8px", borderRadius: 4,
                      background: `${T.purple}14`, border: `1px solid ${T.purple}30`,
                      fontFamily: T.fontUI,
                    }}
                    title="Ask AI for help"
                  >
                    {aiLoading ? "Thinking..." : "AI Assist"}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setTermOutput(""); setAiSuggestion(null); }}
                    style={{ fontSize: 9, color: T.txt3, cursor: "pointer", padding: "2px 6px", fontFamily: T.fontUI }}
                    title="Clear terminal"
                  >
                    Clear
                  </span>
                </>
              )}
              <span style={{ fontSize: 12, color: T.txt3, transform: termOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                ▴
              </span>
            </div>
          </div>

          {termOpen && (
            <>
              {/* Terminal output — raw text like real terminal */}
              <div
                ref={termScrollRef}
                onClick={() => termInputRef.current?.focus()}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "6px 12px",
                  minHeight: 0,
                  fontSize: 12,
                  fontFamily: T.fontMono,
                  lineHeight: "18px",
                  color: "#ccc",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  cursor: "text",
                }}
              >
                {termOutput || (
                  <span style={{ color: T.txt3 }}>
                    {workingDir ? "" : "No working directory. Open a folder to start the terminal."}
                  </span>
                )}

                {/* AI Suggestion */}
                {aiSuggestion && (
                  <AISuggestion
                    text={aiSuggestion.text}
                    onApply={aiSuggestion.cmd ? () => {
                      window.akatsuki.shinra.shellWrite(aiSuggestion.cmd + "\n");
                      setAiSuggestion(null);
                    } : null}
                    onDismiss={() => setAiSuggestion(null)}
                  />
                )}
              </div>

              {/* Terminal input */}
              <form
                onSubmit={handleTermSubmit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 12px",
                  height: 32,
                  minHeight: 32,
                  borderTop: `1px solid ${T.border}`,
                  background: "#111",
                }}
              >
                <span style={{ color: T.green, fontSize: 12, fontFamily: T.fontMono, flexShrink: 0 }}>❯</span>
                <input
                  ref={termInputRef}
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={handleTermKeyDown}
                  placeholder={shellActive ? "" : "Shell not active..."}
                  disabled={!shellActive}
                  autoFocus
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fff",
                    fontSize: 12,
                    fontFamily: T.fontMono,
                    padding: 0,
                  }}
                />
              </form>
            </>
          )}
        </div>
      </div>

      {/* ── ⌘P File Palette Overlay ──────────────────────────────────────── */}
      {fileSearchOpen && (
        <div
          onClick={() => setFileSearchOpen(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 100,
            background: "rgba(7,11,20,0.7)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: 80,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxHeight: 400,
              background: T.bg1, border: `1px solid ${T.border2}`,
              borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ padding: "0 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, height: 42 }}>
              <span style={{ color: T.txt3, fontSize: 13 }}>⌘P</span>
              <input
                ref={fileSearchRef}
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setFileSearchOpen(false); setFileSearchQuery(""); }
                  if (e.key === "Enter" && filteredPalette.length > 0) {
                    setActiveFile(filteredPalette[0]);
                    setFileSearchOpen(false); setFileSearchQuery("");
                  }
                }}
                placeholder="Search open files..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: T.txt, fontSize: 13, fontFamily: T.fontUI,
                }}
              />
              <span
                onClick={() => { setFileSearchOpen(false); setFileSearchQuery(""); }}
                style={{ color: T.txt3, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, background: T.bg3 }}
              >
                Esc
              </span>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredPalette.length === 0 ? (
                <div style={{ padding: "20px 16px", color: T.txt3, fontSize: 12, fontFamily: T.fontUI, textAlign: "center" }}>
                  {openFiles.length === 0 ? "No files open" : "No match"}
                </div>
              ) : (
                filteredPalette.map((fp) => {
                  const name = fp.split("/").pop();
                  const dir = fp.replace(workingDir || "", "");
                  const meta = getExtMeta(name);
                  return (
                    <div
                      key={fp}
                      onClick={() => { setActiveFile(fp); setFileSearchOpen(false); setFileSearchQuery(""); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "7px 16px",
                        cursor: "pointer", background: fp === activeFile ? `${T.blue}14` : "transparent",
                        borderLeft: fp === activeFile ? `2px solid ${T.blue}` : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => { if (fp !== activeFile) e.currentTarget.style.background = T.bg3; }}
                      onMouseLeave={(e) => { if (fp !== activeFile) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, fontFamily: T.fontMono, width: 20, textAlign: "center" }}>{meta.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.txt, fontFamily: T.fontUI }}>{name}</span>
                      <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dir}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScreenEditor;

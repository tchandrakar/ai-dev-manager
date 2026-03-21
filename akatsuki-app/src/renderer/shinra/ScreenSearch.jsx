import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Spinner } from "../components";
import { useShinra, highlightTS } from "./ShinraApp";

// ── Filter tab definitions ──────────────────────────────────────────────────
const TABS = [
  { id: "all",       label: "All" },
  { id: "files",     label: "Files" },
  { id: "content",   label: "Content" },
  { id: "symbols",   label: "Symbols" },
  { id: "functions", label: "Functions" },
];

// Regex patterns for symbol/function detection
const SYMBOL_RE = /^\s*(export\s+)?(default\s+)?(const|let|var|class|function|interface|type|enum|abstract\s+class)\s+(\w+)/;
const FUNCTION_RE = /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)|^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(|^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(\w+\s*)?\s*=>/;

// File extension to icon/color mapping
const EXT_COLORS = {
  js: T.amber, jsx: T.amber, ts: T.blue, tsx: T.blue,
  json: T.green, css: T.purple, scss: T.purple, html: T.red,
  md: T.txt2, yml: T.cyan, yaml: T.cyan, py: T.green,
  rs: T.red, go: T.cyan, toml: T.txt2, sh: T.green,
};

function extColor(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  return EXT_COLORS[ext] || T.txt2;
}

function fileIcon(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const icons = {
    js: "JS", jsx: "JX", ts: "TS", tsx: "TX",
    json: "{}", css: "#", html: "<>", md: "M",
    py: "Py", rs: "Rs", go: "Go", sh: "$",
  };
  return icons[ext] || "F";
}

// ── FilterTab ───────────────────────────────────────────────────────────────
function FilterTab({ tab, isActive, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "4px 14px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: isActive ? 700 : 500,
        fontFamily: T.fontUI,
        color: isActive ? T.blue : T.txt2,
        background: isActive ? `${T.blue}18` : hov ? T.bg3 : "transparent",
        border: isActive ? `1px solid ${T.blue}40` : "1px solid transparent",
        cursor: "pointer",
        transition: "all 0.15s ease",
        outline: "none",
        whiteSpace: "nowrap",
      }}
    >
      {tab.label}
    </button>
  );
}

// ── PreviewLine ─────────────────────────────────────────────────────────────
function PreviewLine({ lineNum, text, isHighlighted, query }) {
  const tokens = highlightTS(text);

  // If this is the highlighted line, render with amber background
  return (
    <div
      style={{
        display: "flex",
        minHeight: 20,
        lineHeight: "20px",
        fontFamily: T.fontMono,
        fontSize: 11,
        background: isHighlighted ? `${T.amber}14` : "transparent",
        borderLeft: isHighlighted ? `2px solid ${T.amber}` : "2px solid transparent",
        paddingLeft: 4,
      }}
    >
      <span
        style={{
          width: 44,
          textAlign: "right",
          paddingRight: 12,
          color: isHighlighted ? T.amber : T.txt3,
          flexShrink: 0,
          userSelect: "none",
          fontWeight: isHighlighted ? 600 : 400,
        }}
      >
        {lineNum}
      </span>
      <span style={{ whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
        {tokens.map((tok, i) => (
          <span key={i} style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : undefined }}>
            {tok.text}
          </span>
        ))}
      </span>
    </div>
  );
}

// ── ResultItem ──────────────────────────────────────────────────────────────
function ResultItem({ item, query, isSelected, onClick, flatIdx }) {
  const [hov, setHov] = useState(false);
  const filename = item.file.split("/").pop();
  const dir = item.file.split("/").slice(0, -1).join("/");
  const color = extColor(filename);
  const icon = fileIcon(filename);

  // Highlight query match in the text
  function highlightMatch(text, q) {
    if (!q || !text) return [{ text, hl: false }];
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const parts = [];
    let last = 0;
    let idx = lower.indexOf(ql, last);
    while (idx !== -1) {
      if (idx > last) parts.push({ text: text.slice(last, idx), hl: false });
      parts.push({ text: text.slice(idx, idx + ql.length), hl: true });
      last = idx + ql.length;
      idx = lower.indexOf(ql, last);
    }
    if (last < text.length) parts.push({ text: text.slice(last), hl: false });
    return parts;
  }

  const nameParts = highlightMatch(filename, query);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-result-idx={flatIdx}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 12px",
        cursor: "pointer",
        background: isSelected ? `${T.blue}14` : hov ? T.bg3 : "transparent",
        borderLeft: isSelected ? `2px solid ${T.blue}` : "2px solid transparent",
        transition: "background 0.1s ease",
      }}
    >
      {/* File icon */}
      <span
        style={{
          width: 28,
          height: 22,
          borderRadius: 4,
          background: `${color}18`,
          color,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: T.fontMono,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* File name with match highlighting */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.fontUI, color: T.txt }}>
            {nameParts.map((p, i) => (
              <span key={i} style={p.hl ? { background: `${T.amber}40`, color: T.amber, borderRadius: 2, padding: "0 1px" } : undefined}>
                {p.text}
              </span>
            ))}
          </span>
          {item.line != null && (
            <Badge style={{ fontSize: 9, padding: "1px 5px" }}>:{item.line}</Badge>
          )}
        </div>

        {/* File path */}
        <div
          style={{
            fontSize: 10,
            color: T.txt3,
            fontFamily: T.fontMono,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: 1,
          }}
        >
          {dir}
        </div>

        {/* Matching line text for content/symbol/function results */}
        {item.text && (
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              fontFamily: T.fontMono,
              color: T.txt2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {highlightMatch(item.text.trim(), query).map((p, i) => (
              <span
                key={i}
                style={
                  p.hl
                    ? { background: `${T.amber}40`, color: T.amber, borderRadius: 2, padding: "0 2px" }
                    : undefined
                }
              >
                {p.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ResultGroup ─────────────────────────────────────────────────────────────
function ResultGroup({ filePath, items, query, selectedItem, onSelect, startFlatIdx, selectedIdx }) {
  const [collapsed, setCollapsed] = useState(false);
  const filename = filePath.split("/").pop();
  const color = extColor(filename);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Group header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          cursor: "pointer",
          background: T.bg2,
          borderBottom: `1px solid ${T.border}`,
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: T.txt3,
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
        >
          ▼
        </span>
        <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.txt, fontFamily: T.fontUI }}>{filename}</span>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {filePath}
        </span>
        <Badge style={{ fontSize: 9, padding: "1px 5px" }}>{items.length}</Badge>
      </div>

      {/* Items */}
      {!collapsed &&
        items.map((item, idx) => {
          const fi = (startFlatIdx ?? 0) + idx;
          return (
            <ResultItem
              key={`${item.file}:${item.line ?? idx}`}
              item={item}
              query={query}
              flatIdx={fi}
              isSelected={selectedIdx === fi || (selectedItem && selectedItem.file === item.file && selectedItem.line === item.line)}
              onClick={() => onSelect(item, fi)}
            />
          );
        })}
    </div>
  );
}

// ── Main ScreenSearch ───────────────────────────────────────────────────────
function ScreenSearch() {
  const { workingDir, openFiles, setOpenFiles, setActiveFile, setActiveTab, searchOpen, setSearchOpen } = useShinra();

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [previewContent, setPreviewContent] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const previewRef = useRef(null);
  const resultsRef = useRef(null);

  // Auto-focus on mount and whenever searchOpen flips to true
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      if (setSearchOpen) setSearchOpen(false); // reset flag after consuming
    }
  }, [searchOpen, setSearchOpen]);

  // Flat results list for arrow-key navigation
  const flatResults = results;

  // Sync selectedItem with selectedIdx
  useEffect(() => {
    if (selectedIdx >= 0 && selectedIdx < flatResults.length) {
      setSelectedItem(flatResults[selectedIdx]);
      // Scroll result into view
      if (resultsRef.current) {
        const el = resultsRef.current.querySelector(`[data-result-idx="${selectedIdx}"]`);
        if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIdx, flatResults]);

  // Escape → go back to editor
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setActiveTab("editor");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveTab]);

  // ── Walk directory tree for file-name search ────────────────────────────
  const walkForFiles = useCallback(async (dir, q, maxDepth = 8, maxResults = 100) => {
    const found = [];
    const queue = [{ path: dir, depth: 0 }];

    while (queue.length > 0 && found.length < maxResults) {
      const { path: current, depth } = queue.shift();
      if (depth > maxDepth) continue;

      const res = await window.akatsuki.shinra.readDir(current);
      if (res.error || !res.entries) continue;

      for (const entry of res.entries) {
        if (found.length >= maxResults) break;
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;

        if (entry.isDir) {
          queue.push({ path: entry.path, depth: depth + 1 });
        } else {
          if (entry.name.toLowerCase().includes(q.toLowerCase())) {
            found.push({ file: entry.path, line: null, text: null });
          }
        }
      }
    }
    return found;
  }, []);

  // ── Search content via IPC ──────────────────────────────────────────────
  const searchContent = useCallback(async (dir, q, glob) => {
    const res = await window.akatsuki.shinra.searchFiles({ dir, query: q, glob });
    if (res.error) return [];
    return res.results || [];
  }, []);

  // ── Search symbols (class/function/const/export declarations) ───────────
  const searchSymbols = useCallback(async (dir, q) => {
    const res = await window.akatsuki.shinra.searchFiles({
      dir,
      query: q,
      glob: "js,jsx,ts,tsx,mjs,cjs",
    });
    if (res.error) return [];
    return (res.results || []).filter((r) => SYMBOL_RE.test(r.text));
  }, []);

  // ── Search functions specifically ───────────────────────────────────────
  const searchFunctions = useCallback(async (dir, q) => {
    const res = await window.akatsuki.shinra.searchFiles({
      dir,
      query: q,
      glob: "js,jsx,ts,tsx,mjs,cjs",
    });
    if (res.error) return [];
    return (res.results || []).filter((r) => FUNCTION_RE.test(r.text));
  }, []);

  // ── Debounced search dispatcher ─────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !workingDir) {
      setResults([]);
      setSearchTime(null);
      setSelectedItem(null);
      setPreviewContent(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSelectedItem(null);
      setPreviewContent(null);
      const t0 = performance.now();

      try {
        let res = [];
        const q = query.trim();

        switch (activeFilter) {
          case "files":
            res = await walkForFiles(workingDir, q);
            break;
          case "content":
            res = await searchContent(workingDir, q);
            break;
          case "symbols":
            res = await searchSymbols(workingDir, q);
            break;
          case "functions":
            res = await searchFunctions(workingDir, q);
            break;
          case "all":
          default: {
            // Run file name search and content search in parallel
            const [fileRes, contentRes] = await Promise.all([
              walkForFiles(workingDir, q, 8, 30),
              searchContent(workingDir, q),
            ]);
            // Deduplicate: file results first, then content results
            const seen = new Set();
            for (const r of fileRes) {
              const key = `${r.file}:${r.line ?? ""}`;
              if (!seen.has(key)) { seen.add(key); res.push(r); }
            }
            for (const r of contentRes) {
              const key = `${r.file}:${r.line ?? ""}`;
              if (!seen.has(key)) { seen.add(key); res.push(r); }
            }
            break;
          }
        }

        const elapsed = performance.now() - t0;
        setResults(res);
        setSearchTime(elapsed);
      } catch (err) {
        setResults([]);
        setSearchTime(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeFilter, workingDir, walkForFiles, searchContent, searchSymbols, searchFunctions]);

  // ── Load preview when an item is selected ───────────────────────────────
  useEffect(() => {
    if (!selectedItem) {
      setPreviewContent(null);
      return;
    }

    let canceled = false;
    setPreviewLoading(true);

    (async () => {
      const res = await window.akatsuki.shinra.readFile(selectedItem.file);
      if (canceled) return;
      if (res.error) {
        setPreviewContent(null);
      } else {
        setPreviewContent(res.content);
      }
      setPreviewLoading(false);
    })();

    return () => { canceled = true; };
  }, [selectedItem]);

  // ── Scroll preview to matching line ─────────────────────────────────────
  useEffect(() => {
    if (previewContent && selectedItem?.line && previewRef.current) {
      const lineEl = previewRef.current.querySelector(`[data-line="${selectedItem.line}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [previewContent, selectedItem]);

  // ── Open file in editor ─────────────────────────────────────────────────
  const openInEditor = useCallback(
    (item) => {
      const fp = item.file;
      setOpenFiles((prev) => {
        if (prev.includes(fp)) return prev;
        return [...prev, fp];
      });
      setActiveFile(fp);
      setActiveTab("editor");
    },
    [setOpenFiles, setActiveFile, setActiveTab]
  );

  // ── Group results by file ─────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.file)) map.set(r.file, []);
      map.get(r.file).push(r);
    }
    return Array.from(map.entries()); // [[filePath, items], ...]
  }, [results]);

  // ── Preview lines ─────────────────────────────────────────────────────
  const previewLines = useMemo(() => {
    if (!previewContent) return [];
    return previewContent.split("\n");
  }, [previewContent]);

  // ── No workingDir state ─────────────────────────────────────────────────
  if (!workingDir) {
    return (
      <div
        className="screen-enter"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.fontUI,
          gap: 12,
        }}
      >
        <span style={{ fontSize: 36, opacity: 0.3 }}>&#x1F50D;</span>
        <span style={{ fontSize: 14, color: T.txt2, fontWeight: 500 }}>
          Open a project folder to search
        </span>
        <span style={{ fontSize: 11, color: T.txt3 }}>
          Use the Editor tab to open a folder first
        </span>
      </div>
    );
  }

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
      {/* ── Search Header ──────────────────────────────────────────────── */}
      <div
        style={{
          padding: "20px 0 12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          borderBottom: `1px solid ${T.border}`,
          background: T.bg1,
          flexShrink: 0,
        }}
      >
        {/* Search input */}
        <div style={{ width: 640, maxWidth: "90%", position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              color: T.txt3,
              pointerEvents: "none",
            }}
          >
            &#x1F50D;
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(i + 1, flatResults.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                const item = selectedIdx >= 0 ? flatResults[selectedIdx] : flatResults[0];
                if (item) openInEditor(item);
              }
            }}
            placeholder="Search files, content, symbols, functions..."
            style={{
              width: "100%",
              height: 40,
              padding: "0 14px 0 38px",
              borderRadius: 8,
              border: `1px solid ${T.border2}`,
              background: T.bg3,
              color: T.txt,
              fontSize: 14,
              fontFamily: T.fontUI,
              outline: "none",
              transition: "border-color 0.15s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = `${T.blue}60`)}
            onBlur={(e) => (e.target.style.borderColor = T.border2)}
          />
          {loading && (
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
              <Spinner size={16} />
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {TABS.map((tab) => (
            <FilterTab
              key={tab.id}
              tab={tab}
              isActive={activeFilter === tab.id}
              onClick={() => setActiveFilter(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Results + Preview ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Results list */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: selectedItem ? `1px solid ${T.border}` : "none",
          }}
        >
          {/* Results meta bar */}
          {(results.length > 0 || (query.trim() && !loading)) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 16px",
                borderBottom: `1px solid ${T.border}`,
                background: T.bg1,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI }}>
                {results.length} result{results.length !== 1 ? "s" : ""}
                {grouped.length > 0 && ` in ${grouped.length} file${grouped.length !== 1 ? "s" : ""}`}
              </span>
              {searchTime != null && (
                <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
                  {searchTime < 1000
                    ? `${Math.round(searchTime)}ms`
                    : `${(searchTime / 1000).toFixed(2)}s`}
                </span>
              )}
            </div>
          )}

          {/* Results body */}
          <div ref={resultsRef} style={{ flex: 1, overflowY: "auto" }}>
            {/* Loading state */}
            {loading && results.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                  gap: 12,
                }}
              >
                <Spinner size={24} />
                <span style={{ fontSize: 12, color: T.txt3 }}>Searching...</span>
              </div>
            )}

            {/* Empty state - no query */}
            {!loading && !query.trim() && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 28, opacity: 0.3 }}>&#x1F50D;</span>
                <span style={{ fontSize: 12, color: T.txt3, textAlign: "center" }}>
                  Type to search across your project
                </span>
              </div>
            )}

            {/* Empty state - no results */}
            {!loading && query.trim() && results.length === 0 && searchTime != null && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 28, opacity: 0.3 }}>&#x2205;</span>
                <span style={{ fontSize: 12, color: T.txt3, textAlign: "center" }}>
                  No results found for &lsquo;{query}&rsquo;
                </span>
              </div>
            )}

            {/* Grouped results */}
            {(() => {
              let flatIdx = 0;
              return grouped.map(([filePath, items]) => {
                const startIdx = flatIdx;
                flatIdx += items.length;
                return (
                  <ResultGroup
                    key={filePath}
                    filePath={filePath}
                    items={items}
                    query={query}
                    selectedItem={selectedItem}
                    startFlatIdx={startIdx}
                    selectedIdx={selectedIdx}
                    onSelect={(item, idx) => {
                      setSelectedItem(item);
                      setSelectedIdx(idx);
                    }}
                  />
                );
              });
            })()}
          </div>
        </div>

        {/* ── Preview Panel ──────────────────────────────────────────── */}
        {selectedItem && (
          <div
            style={{
              width: 400,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: T.bg0,
            }}
          >
            {/* Preview header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px",
                height: 36,
                borderBottom: `1px solid ${T.border}`,
                background: T.bg1,
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 3, height: 18, background: T.teal, borderRadius: 2, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: T.txt,
                    fontFamily: T.fontUI,
                    textTransform: "uppercase",
                  }}
                >
                  Preview
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: T.txt3,
                    fontFamily: T.fontMono,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedItem.file.split("/").pop()}
                </span>
              </div>
              <Btn
                variant="ghost"
                onClick={() => openInEditor(selectedItem)}
                style={{ height: 24, fontSize: 10, padding: "0 10px" }}
              >
                Open in Editor
              </Btn>
            </div>

            {/* Preview content */}
            <div ref={previewRef} style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "4px 0" }}>
              {previewLoading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 32,
                  }}
                >
                  <Spinner size={18} />
                </div>
              )}

              {!previewLoading && previewContent == null && (
                <div style={{ padding: 24, textAlign: "center", color: T.txt3, fontSize: 11 }}>
                  Unable to load preview
                </div>
              )}

              {!previewLoading &&
                previewLines.map((line, idx) => {
                  const lineNum = idx + 1;
                  return (
                    <div key={lineNum} data-line={lineNum}>
                      <PreviewLine
                        lineNum={lineNum}
                        text={line}
                        isHighlighted={selectedItem.line != null && lineNum === selectedItem.line}
                        query={query}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScreenSearch;

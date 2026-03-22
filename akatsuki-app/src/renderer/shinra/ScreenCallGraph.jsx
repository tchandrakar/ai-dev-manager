import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Spinner } from "../components";
import { useShinra } from "./ShinraApp";

const Graph3D = lazy(() => import("./Graph3D"));

// ── Constants ────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  export: T.blue,
  internal: T.green,
  callback: T.amber,
  async: T.purple,
};

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: T.bg3, borderRadius: 6, padding: "8px 10px",
      border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color || T.txt, fontFamily: T.fontMono }}>
        {value}
      </span>
    </div>
  );
}

function ParamRow({ param, index }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 0", borderBottom: `1px solid ${T.border}20`,
    }}>
      <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, width: 14, textAlign: "right" }}>
        {index + 1}.
      </span>
      <span style={{ fontSize: 11, color: T.blue, fontFamily: T.fontMono }}>
        {param.name}
      </span>
      <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
        : {param.type}
      </span>
    </div>
  );
}

function FunctionSignature({ fn }) {
  // Heuristic: PascalCase names → function declaration; camelCase → arrow/const
  const isArrow = !fn.name.match(/^[A-Z]/);

  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6,
      padding: "8px 12px", fontFamily: T.fontMono, fontSize: 12,
      lineHeight: 1.6, overflowX: "auto", whiteSpace: "nowrap",
    }}>
      {fn.isExported && (
        <span style={{ color: T.purple }}>export </span>
      )}
      {isArrow ? (
        <>
          <span style={{ color: T.purple }}>const </span>
          <span style={{ color: T.blue }}>{fn.name}</span>
          <span style={{ color: T.txt2 }}> = </span>
          {fn.isAsync && <span style={{ color: T.purple }}>async </span>}
          <span style={{ color: T.txt2 }}>(</span>
          {fn.params.map((p, i) => (
            <React.Fragment key={p.name + i}>
              {i > 0 && <span style={{ color: T.txt2 }}>, </span>}
              <span style={{ color: T.cyan }}>{p.name}</span>
              <span style={{ color: T.txt2 }}>: </span>
              <span style={{ color: T.green }}>{p.type}</span>
            </React.Fragment>
          ))}
          <span style={{ color: T.txt2 }}>)</span>
          <span style={{ color: T.txt2 }}>: </span>
          <span style={{ color: T.amber }}>{fn.returnType}</span>
        </>
      ) : (
        <>
          {fn.isAsync && <span style={{ color: T.purple }}>async </span>}
          <span style={{ color: T.purple }}>function </span>
          <span style={{ color: T.blue }}>{fn.name}</span>
          <span style={{ color: T.txt2 }}>(</span>
          {fn.params.map((p, i) => (
            <React.Fragment key={p.name + i}>
              {i > 0 && <span style={{ color: T.txt2 }}>, </span>}
              <span style={{ color: T.cyan }}>{p.name}</span>
              <span style={{ color: T.txt2 }}>: </span>
              <span style={{ color: T.green }}>{p.type}</span>
            </React.Fragment>
          ))}
          <span style={{ color: T.txt2 }}>)</span>
          <span style={{ color: T.txt2 }}>: </span>
          <span style={{ color: T.amber }}>{fn.returnType}</span>
        </>
      )}
    </div>
  );
}

function CallerItem({ fnData, isSelected, onClick }) {
  const [hov, setHov] = useState(false);
  const color = TYPE_COLORS[fnData.type] || T.green;
  const shortFile = fnData.file.split("/").pop();

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        padding: "6px 10px", cursor: "pointer",
        background: isSelected ? `${color}14` : hov ? T.bg3 : "transparent",
        borderLeft: `2px solid ${isSelected ? color : "transparent"}`,
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.txt, fontFamily: T.fontMono }}>
          {fnData.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 }}>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
          {shortFile}:{fnData.startLine}
        </span>
        <Badge style={{ fontSize: 8, padding: "0 5px" }}>{fnData.type}</Badge>
      </div>
    </div>
  );
}

function CalleeItem({ fnData, isSelected, onClick }) {
  const [hov, setHov] = useState(false);
  const color = TYPE_COLORS[fnData.type] || T.green;
  const shortFile = fnData.file.split("/").pop();

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        padding: "6px 10px", cursor: "pointer",
        background: isSelected ? `${color}14` : hov ? T.bg3 : "transparent",
        borderLeft: `2px solid ${isSelected ? color : "transparent"}`,
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.txt, fontFamily: T.fontMono }}>
          {fnData.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 }}>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
          {shortFile}:{fnData.startLine}
        </span>
        <Badge style={{ fontSize: 8, padding: "0 5px" }}>{fnData.type}</Badge>
      </div>
    </div>
  );
}

// ── NL Search ───────────────────────────────────────────────────────────────

function searchFunctionsByQuery(query, fnMap) {
  const stopWords = new Set(["how","are","we","the","is","a","an","when","what","where","does","do","in","to","for","of","and","or","this","that","it","be","have","has","was","were","been","being","from","by","with","at","on","can","could","should","would","will","shall"]);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));
  if (tokens.length === 0) return [];

  const scores = [];
  for (const [key, fn] of fnMap) {
    let score = 0;
    const nameLower = fn.name.toLowerCase();
    const fileLower = fn.file.toLowerCase().split("/").pop();
    const bodyLower = (fn.body || "").slice(0, 500).toLowerCase();
    const paramNames = (fn.params || []).map(p => p.name.toLowerCase()).join(" ");

    for (const token of tokens) {
      if (nameLower.includes(token)) score += 3;
      if (fileLower.includes(token)) score += 1.5;
      if (paramNames.includes(token)) score += 2;
      if (bodyLower.includes(token)) score += 1;
    }
    if (score > 0) scores.push({ key, score, fn });
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, 20);
}

// ── ScreenCallGraph ─────────────────────────────────────────────────────────

function ScreenCallGraph() {
  const {
    workingDir, activeFile, openFiles, setOpenFiles, setActiveFile, setActiveTab,
    indexStatus, functionMap: sharedFunctionMap, fullScan,
  } = useShinra();

  const [graphData, setGraphData] = useState(null); // Map from buildCallGraph
  const [selectedKey, setSelectedKey] = useState(null);
  const [depth, setDepth] = useState(2);
  const [fileTarget, setFileTarget] = useState("__active__"); // "__active__", "__all__", or a file path
  const [error, setError] = useState(null);
  const [fileDropOpen, setFileDropOpen] = useState(false);
  const [nlQuery, setNlQuery] = useState("");
  const [nlHighlights, setNlHighlights] = useState(null);
  const dropRef = useRef(null);
  const initialAnalyzeDone = useRef(false);

  const analyzing = indexStatus === "scanning";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setFileDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Resolve which file(s) to analyze
  const resolvedTarget = useMemo(() => {
    if (fileTarget === "__active__") return activeFile;
    if (fileTarget === "__all__") return "__all__";
    return fileTarget;
  }, [fileTarget, activeFile]);

  // Build dropdown options
  const fileOptions = useMemo(() => {
    const opts = [
      { value: "__active__", label: activeFile ? `Active: ${activeFile.split("/").pop()}` : "Active file (none)" },
      { value: "__all__", label: "All project files" },
    ];
    if (openFiles) {
      for (const fp of openFiles) {
        if (fp !== activeFile) {
          opts.push({ value: fp, label: fp.split("/").pop() });
        }
      }
    }
    return opts;
  }, [openFiles, activeFile]);

  // ── Analyze — now instant, reads from shared index ──────────────────────
  const handleAnalyze = useCallback(() => {
    setError(null);
    setSelectedKey(null);

    if (!sharedFunctionMap || sharedFunctionMap.size === 0) {
      setError("Index not ready — waiting for project scan");
      return;
    }

    let filtered;
    if (resolvedTarget === "__all__") {
      filtered = sharedFunctionMap;
    } else if (resolvedTarget) {
      filtered = new Map();
      for (const [key, fn] of sharedFunctionMap) {
        if (fn.file === resolvedTarget) filtered.set(key, fn);
      }
    } else {
      setError("No file selected");
      return;
    }

    if (filtered.size === 0) {
      setError("No functions found for the selected scope");
      return;
    }

    setGraphData(filtered);
    const keys = Array.from(filtered.keys());
    if (keys.length > 0) setSelectedKey(keys[0]);
  }, [resolvedTarget, sharedFunctionMap]);

  // Auto-analyze once when index becomes ready (user clicks Analyze manually for target changes)
  useEffect(() => {
    if (indexStatus === "ready" && sharedFunctionMap && sharedFunctionMap.size > 0) {
      if (!initialAnalyzeDone.current) {
        initialAnalyzeDone.current = true;
        handleAnalyze();
      }
    }
    if (indexStatus !== "ready") {
      initialAnalyzeDone.current = false;
    }
  }, [indexStatus, sharedFunctionMap]);

  // ── Selected function data ──────────────────────────────────────────────
  const selectedFn = useMemo(() => {
    if (!graphData || !selectedKey) return null;
    return graphData.get(selectedKey) || null;
  }, [graphData, selectedKey]);

  // Incoming callers (functions that call selectedFn)
  const incomingFns = useMemo(() => {
    if (!selectedFn || !graphData) return [];
    const seen = new Set();
    const result = [];
    const queue = [{ keys: selectedFn.incomingKeys, d: 1 }];
    while (queue.length > 0) {
      const { keys, d } = queue.shift();
      if (d > depth) continue;
      for (const k of keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        const fn = graphData.get(k);
        if (fn) {
          result.push({ ...fn, key: k, depth: d });
          if (d < depth) queue.push({ keys: fn.incomingKeys, d: d + 1 });
        }
      }
    }
    return result;
  }, [selectedFn, graphData, depth]);

  // Outgoing callees (functions that selectedFn calls)
  const outgoingFns = useMemo(() => {
    if (!selectedFn || !graphData) return [];
    const seen = new Set();
    const result = [];
    const queue = [{ keys: selectedFn.outgoingKeys, d: 1 }];
    while (queue.length > 0) {
      const { keys, d } = queue.shift();
      if (d > depth) continue;
      for (const k of keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        const fn = graphData.get(k);
        if (fn) {
          result.push({ ...fn, key: k, depth: d });
          if (d < depth) queue.push({ keys: fn.outgoingKeys, d: d + 1 });
        }
      }
    }
    return result;
  }, [selectedFn, graphData, depth]);

  // Max depth in graph (for stats)
  const maxDepthStat = useMemo(() => {
    if (!graphData || !selectedKey) return 0;
    const visited = new Set();
    function dfs(key, d) {
      if (visited.has(key) || d > 10) return d;
      visited.add(key);
      const fn = graphData.get(key);
      if (!fn) return d;
      let maxD = d;
      for (const k of fn.outgoingKeys) {
        maxD = Math.max(maxD, dfs(k, d + 1));
      }
      return maxD;
    }
    return dfs(selectedKey, 0);
  }, [graphData, selectedKey]);

  // Function list for "all functions" fallback
  const allFunctionsList = useMemo(() => {
    if (!graphData) return [];
    return Array.from(graphData.entries()).map(([key, fn]) => ({ key, ...fn }));
  }, [graphData]);

  // ── Graph3D data transforms ──────────────────────────────────────────
  const callGraphNodes = useMemo(() => {
    if (!graphData) return [];
    return Array.from(graphData.entries()).map(([key, fn]) => ({
      id: key,
      label: fn.name,
      type: fn.type,
      color: TYPE_COLORS[fn.type] || T.txt,
      size: key === selectedKey ? 2.5 : 1.5,
    }));
  }, [graphData, selectedKey]);

  const callGraphEdges = useMemo(() => {
    if (!graphData) return [];
    const edges = [];
    for (const [key, fn] of graphData) {
      for (const outKey of fn.outgoingKeys) {
        if (graphData.has(outKey)) {
          edges.push({ from: key, to: outKey });
        }
      }
    }
    return edges;
  }, [graphData]);

  // ── NL Search handler ──────────────────────────────────────────────
  const handleNLSearch = useCallback(() => {
    if (!nlQuery.trim() || !sharedFunctionMap || sharedFunctionMap.size === 0) {
      setNlHighlights(null);
      return;
    }
    setError(null);
    const matches = searchFunctionsByQuery(nlQuery, sharedFunctionMap);
    if (matches.length === 0) {
      setError("No functions matched your query. Try different keywords.");
      setNlHighlights(null);
      return;
    }

    const toInclude = new Set();
    for (const match of matches) toInclude.add(match.key);
    // Expand by 1 depth
    for (const match of matches) {
      const fn = sharedFunctionMap.get(match.key);
      if (!fn) continue;
      for (const k of (fn.outgoingKeys || []).slice(0, 5)) toInclude.add(k);
      for (const k of (fn.incomingKeys || []).slice(0, 5)) toInclude.add(k);
    }
    const subGraph = new Map();
    for (const key of toInclude) {
      if (sharedFunctionMap.has(key)) subGraph.set(key, sharedFunctionMap.get(key));
    }

    setGraphData(subGraph);
    setSelectedKey(matches[0].key);
    setNlHighlights(new Set(matches.map(m => m.key)));
  }, [nlQuery, sharedFunctionMap]);

  // ── Click node to re-center ───────────────────────────────────────────
  const handleNodeClick = useCallback((key) => {
    if (graphData && graphData.has(key)) {
      setSelectedKey(key);
    }
  }, [graphData]);

  // ── Go to definition ──────────────────────────────────────────────────
  const handleGoToDefinition = useCallback(() => {
    if (selectedFn && selectedFn.file) {
      setOpenFiles((prev) => {
        if (prev.includes(selectedFn.file)) return prev;
        return [...prev, selectedFn.file];
      });
      setActiveFile(selectedFn.file);
      setActiveTab("editor");
    }
  }, [selectedFn, setActiveFile, setOpenFiles, setActiveTab]);

  // ── No workingDir state ───────────────────────────────────────────────
  if (!workingDir) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 12, fontFamily: T.fontUI,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={T.txt3} strokeWidth="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span style={{ color: T.txt3, fontSize: 14 }}>Open a project folder first</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 42, minHeight: 42, display: "flex", alignItems: "center", gap: 10,
        padding: "0 12px", background: T.bg1, borderBottom: `1px solid ${T.border}`,
      }}>
        {/* File selector dropdown */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <div
            onClick={() => setFileDropOpen(!fileDropOpen)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: T.bg3, border: `1px solid ${T.border2}`,
              fontSize: 12, fontFamily: T.fontMono, color: T.txt,
              minWidth: 200, maxWidth: 300,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.txt3} strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileOptions.find((o) => o.value === fileTarget)?.label || "Select file"}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txt3} strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {fileDropOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4,
              background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 6,
              minWidth: 260, maxHeight: 220, overflowY: "auto", zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}>
              {fileOptions.map((opt) => (
                <FileDropdownItem
                  key={opt.value}
                  label={opt.label}
                  isSelected={opt.value === fileTarget}
                  onClick={() => { setFileTarget(opt.value); setFileDropOpen(false); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Depth control */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.txt2 }}>
          <span style={{ fontFamily: T.fontUI }}>Depth:</span>
          {[1, 2, 3, 4, 5].map((d) => (
            <DepthButton key={d} value={d} active={depth === d} onClick={() => setDepth(d)} />
          ))}
        </div>

        {/* NL Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <input
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleNLSearch(); }}
            placeholder="Ask about your code... e.g. 'token count scraping'"
            style={{
              flex: 1, maxWidth: 360, background: T.bg3, border: `1px solid ${T.border2}`,
              borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: T.fontUI,
              color: T.txt, outline: "none",
            }}
          />
          <Btn variant="primary" onClick={handleNLSearch} style={{ height: 28, fontSize: 11 }}>
            Generate
          </Btn>
          {nlHighlights && (
            <Badge style={{ background: `${T.purple}18`, border: `1px solid ${T.purple}40`, color: T.purple, fontSize: 9 }}>
              NL: {nlHighlights.size} matches
            </Badge>
          )}
        </div>

        {/* Function count */}
        {graphData && (
          <span style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
            {graphData.size} function{graphData.size !== 1 ? "s" : ""}
          </span>
        )}

        {/* Analyze button */}
        <Btn
          variant="primary"
          onClick={handleAnalyze}
          disabled={analyzing || (!resolvedTarget && resolvedTarget !== "__all__")}
          style={{ height: 28 }}
        >
          {analyzing ? <Spinner size={12} /> : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
          {analyzing ? "Analyzing..." : "Analyze"}
        </Btn>
      </div>

      {/* ── Main 3-column layout ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left panel: Incoming calls / All functions ────────────────── */}
        <div style={{
          width: 280, minWidth: 280, display: "flex", flexDirection: "column",
          borderRight: `1px solid ${T.border}`, background: T.bg1,
        }}>
          <PanelHeader
            title={selectedFn ? "Incoming Calls" : "Functions"}
            accent={T.cyan}
            count={selectedFn ? incomingFns.length : (graphData ? graphData.size : 0)}
          />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!graphData && !analyzing && (
              <div style={{ padding: 20, textAlign: "center", color: T.txt3, fontSize: 12, fontFamily: T.fontUI }}>
                Select a file and click Analyze
              </div>
            )}
            {analyzing && (
              <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Spinner size={14} />
                <span style={{ fontSize: 12, color: T.txt2, fontFamily: T.fontUI }}>Parsing...</span>
              </div>
            )}
            {graphData && !selectedFn && allFunctionsList.map((fn) => (
              <CallerItem
                key={fn.key}
                fnData={fn}
                isSelected={fn.key === selectedKey}
                onClick={() => setSelectedKey(fn.key)}
              />
            ))}
            {selectedFn && incomingFns.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: T.txt3, fontSize: 11, fontFamily: T.fontUI }}>
                No incoming calls found
              </div>
            )}
            {selectedFn && incomingFns.map((fn) => (
              <CallerItem
                key={fn.key}
                fnData={fn}
                isSelected={false}
                onClick={() => handleNodeClick(fn.key)}
              />
            ))}
            {selectedFn && incomingFns.length > 8 && (
              <div style={{ padding: "6px 12px", fontSize: 10, color: T.txt3, fontFamily: T.fontUI, fontStyle: "italic", borderTop: `1px solid ${T.border}` }}>
                {incomingFns.length} total incoming calls
              </div>
            )}
          </div>
        </div>

        {/* ── Center: 3D Call Graph ──────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {error && (
            <div style={{
              padding: "8px 12px", background: `${T.red}14`, borderBottom: `1px solid ${T.red}30`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span style={{ fontSize: 11, color: T.red, fontFamily: T.fontUI }}>{error}</span>
            </div>
          )}

          {!graphData && !analyzing && !error && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={T.txt3} strokeWidth="1">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="19" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                  <line x1="7" y1="12" x2="10" y2="7" />
                  <line x1="14" y1="7" x2="17" y2="12" />
                  <line x1="7" y1="12" x2="10" y2="17" />
                  <line x1="14" y1="17" x2="17" y2="12" />
                </svg>
                <span style={{ color: T.txt3, fontSize: 13, fontFamily: T.fontUI }}>
                  Select a file and click Analyze
                </span>
                <span style={{ color: T.txt3, fontSize: 11, fontFamily: T.fontUI, opacity: 0.7 }}>
                  Supports .js, .jsx, .ts, .tsx files
                </span>
              </div>
            </div>
          )}

          {analyzing && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Spinner size={28} color={T.purple} />
                <span style={{ color: T.txt2, fontSize: 13, fontFamily: T.fontUI }}>
                  Building call graph...
                </span>
              </div>
            </div>
          )}

          {graphData && (
            <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.txt2, fontFamily: T.fontUI, fontSize: 13 }}>Loading 3D graph...</div>}>
              <Graph3D
                nodes={callGraphNodes}
                edges={callGraphEdges}
                selectedNode={selectedKey}
                onNodeClick={handleNodeClick}
                onNodeHover={() => {}}
                highlightedNodes={nlHighlights}
                style={{ flex: 1 }}
              />
            </Suspense>
          )}
        </div>

        {/* ── Right panel: Function detail ──────────────────────────────── */}
        <div style={{
          width: 280, minWidth: 280, display: "flex", flexDirection: "column",
          borderLeft: `1px solid ${T.border}`, background: T.bg1,
        }}>
          <PanelHeader
            title="Function Detail"
            accent={T.purple}
            count={selectedFn ? outgoingFns.length : undefined}
          />

          {!selectedFn && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: T.txt3, fontSize: 12, fontFamily: T.fontUI }}>
                {graphData ? "Select a function" : "No data"}
              </span>
            </div>
          )}

          {selectedFn && (
            <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
              {/* Function name & file */}
              <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: TYPE_COLORS[selectedFn.type] || T.green, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.txt, fontFamily: T.fontMono }}>
                    {selectedFn.name}
                  </span>
                  {selectedFn.isAsync && (
                    <Badge style={{ fontSize: 8, padding: "0 5px", background: `${T.purple}18`, border: `1px solid ${T.purple}40`, color: T.purple }}>
                      async
                    </Badge>
                  )}
                </div>
                <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, wordBreak: "break-all" }}>
                  {selectedFn.file.split("/").pop()}
                </div>
                <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, marginTop: 2 }}>
                  Lines {selectedFn.startLine} - {selectedFn.endLine}
                </div>
              </div>

              {/* Function Signature */}
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Signature
                </div>
                <FunctionSignature fn={selectedFn} />
              </div>

              {/* Parameters */}
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Parameters ({selectedFn.params.length})
                </div>
                {selectedFn.params.length === 0 && (
                  <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, fontStyle: "italic" }}>none</span>
                )}
                {selectedFn.params.map((p, i) => (
                  <ParamRow key={`${p.name}-${i}`} param={p} index={i} />
                ))}
              </div>

              {/* Input / Output Schema */}
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Contract
                </div>
                <div style={{
                  background: T.bg2, borderRadius: 6, padding: "8px 10px",
                  fontFamily: T.fontMono, fontSize: 11, lineHeight: 1.7,
                  border: `1px solid ${T.border}`,
                }}>
                  <div style={{ color: T.txt3, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                    INPUT
                  </div>
                  {selectedFn.params.length === 0 ? (
                    <div style={{ color: T.txt3, fontStyle: "italic", fontSize: 10, marginBottom: 6 }}>void</div>
                  ) : (
                    selectedFn.params.map((p, i) => (
                      <div key={`io-${p.name}-${i}`} style={{ paddingLeft: 8 }}>
                        <span style={{ color: T.cyan }}>{p.name}</span>
                        <span style={{ color: T.txt3 }}>: </span>
                        <span style={{ color: T.green }}>{p.type}</span>
                      </div>
                    ))
                  )}
                  <div style={{ borderTop: `1px solid ${T.border}`, margin: "6px 0" }} />
                  <div style={{ color: T.txt3, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                    OUTPUT
                  </div>
                  <div style={{ paddingLeft: 8 }}>
                    <span style={{ color: T.amber }}>{selectedFn.returnType}</span>
                  </div>
                </div>
              </div>

              {/* Call statistics */}
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Call Statistics
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <StatCard label="Incoming" value={incomingFns.length} color={T.cyan} />
                  <StatCard label="Outgoing" value={outgoingFns.length} color={T.amber} />
                  <StatCard label="Max Depth" value={maxDepthStat} color={T.purple} />
                </div>
              </div>

              {/* Outgoing calls list */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <div style={{ padding: "8px 12px 4px", fontSize: 9, fontWeight: 700, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Outgoing Calls ({outgoingFns.length})
                </div>
                {outgoingFns.length === 0 && (
                  <div style={{ padding: "4px 12px 8px", fontSize: 10, color: T.txt3, fontFamily: T.fontUI, fontStyle: "italic" }}>
                    No outgoing calls
                  </div>
                )}
                {outgoingFns.map((fn) => (
                  <CalleeItem
                    key={fn.key}
                    fnData={fn}
                    isSelected={false}
                    onClick={() => handleNodeClick(fn.key)}
                  />
                ))}
                {outgoingFns.length > 8 && (
                  <div style={{ padding: "6px 12px", fontSize: 10, color: T.txt3, fontFamily: T.fontUI, fontStyle: "italic", borderTop: `1px solid ${T.border}` }}>
                    {outgoingFns.length} total outgoing calls
                  </div>
                )}
              </div>

              {/* Go to definition button */}
              <div style={{ padding: 12 }}>
                <Btn
                  variant="ghost"
                  onClick={handleGoToDefinition}
                  style={{ width: "100%", justifyContent: "center", height: 30 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Go to Definition
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small helper sub-components (no hooks inside .map) ──────────────────────

function FileDropdownItem({ label, isSelected, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "6px 12px", cursor: "pointer",
        background: isSelected ? `${T.blue}14` : hov ? T.bg3 : "transparent",
        fontSize: 11, fontFamily: T.fontMono, color: isSelected ? T.blue : T.txt,
        borderLeft: `2px solid ${isSelected ? T.blue : "transparent"}`,
        transition: "background 0.15s",
      }}
    >
      {label}
    </div>
  );
}

function DepthButton({ value, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600,
        fontFamily: T.fontMono,
        background: active ? T.blue : hov ? T.bg4 : T.bg3,
        color: active ? "#fff" : T.txt2,
        border: `1px solid ${active ? T.blue : T.border}`,
        transition: "all 0.15s",
      }}
    >
      {value}
    </div>
  );
}

export default ScreenCallGraph;

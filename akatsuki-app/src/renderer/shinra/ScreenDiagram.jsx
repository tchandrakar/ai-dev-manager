import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge } from "../components";
import { useShinra } from "./ShinraApp";

const Graph3D = lazy(() => import("./Graph3D"));

// Color by file category
function categorize(filePath) {
  const name = filePath.split("/").pop().toLowerCase();
  if (/^use[A-Z]/.test(name.split(".")[0]) || name.startsWith("use")) return { cat: "hook", color: T.purple, label: "Hook" };
  if (/\.test\.|\.spec\.|__test__|__spec__/.test(name)) return { cat: "test", color: T.amber, label: "Test" };
  if (/context|provider|store|reducer|slice/.test(name)) return { cat: "state", color: T.teal, label: "State" };
  if (/util|helper|lib|tools|constants|config/.test(name)) return { cat: "util", color: T.green, label: "Util" };
  if (/\.tsx$|\.jsx$/.test(name) || /component|screen|page|layout|view/.test(name)) return { cat: "component", color: T.cyan, label: "Component" };
  if (/index\.(js|ts)$/.test(name)) return { cat: "entry", color: T.blue, label: "Entry" };
  if (/types?\./.test(name) || /\.d\.ts$/.test(name)) return { cat: "types", color: T.txt2, label: "Types" };
  return { cat: "module", color: T.txt, label: "Module" };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extOf(name) {
  const m = name.match(/\.[^.]+$/);
  return m ? m[0] : "";
}

function shortName(fullPath, workingDir) {
  if (!workingDir) return fullPath;
  return fullPath.startsWith(workingDir) ? fullPath.slice(workingDir.length + 1) : fullPath;
}

// Detect circular dependencies
function findCycles(nodes, edges) {
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
  }

  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const next of (adj[node] || [])) {
      dfs(next, [...path, node]);
    }
    stack.delete(node);
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id, []);
  }

  return cycles;
}

// ── Named sub-components ─────────────────────────────────────────────────────

function FileListItem({ fileId, node, connectionCount, isSelected, onClick }) {
  const { color, label } = categorize(fileId);
  return (
    <div
      onClick={() => onClick(fileId)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 10px", cursor: "pointer", borderRadius: 4,
        background: isSelected ? `${T.blue}14` : "transparent",
        borderLeft: isSelected ? `2px solid ${T.blue}` : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: isSelected ? T.txt : T.txt2,
          fontWeight: isSelected ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {node.name}
        </div>
      </div>
      <span style={{
        fontSize: 9, color: T.txt3, background: T.bg3,
        padding: "1px 5px", borderRadius: 6, flexShrink: 0,
      }}>
        {connectionCount}
      </span>
    </div>
  );
}

function ImportListItem({ fileId, workingDir, onClick }) {
  const { color } = categorize(fileId);
  const display = shortName(fileId, workingDir);
  return (
    <div
      onClick={() => onClick(fileId)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 8px", cursor: "pointer", borderRadius: 3,
        fontSize: 10, color: T.txt2, fontFamily: T.fontMono,
      }}
    >
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: color, flexShrink: 0,
      }} />
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {display}
      </span>
    </div>
  );
}

function HealthGauge({ score }) {
  const r = 36;
  const stroke = 6;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circ * (1 - pct);
  const color = score >= 70 ? "#3FB950" : score >= 40 ? "#F5A623" : "#F85149";
  const size = (r + stroke) * 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={T.bg3} strokeWidth={stroke}
        />
        {/* Score arc */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
        {/* Score text */}
        <text
          x={size / 2} y={size / 2 - 2}
          textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={18} fontWeight={700} fontFamily={T.fontMono}
        >
          {score}
        </text>
        <text
          x={size / 2} y={size / 2 + 14}
          textAnchor="middle" dominantBaseline="central"
          fill={T.txt3} fontSize={9} fontFamily={T.fontUI}
        >
          / 100
        </text>
      </svg>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ScreenDiagram() {
  const {
    workingDir, setOpenFiles, setActiveFile, setActiveTab,
    indexStatus, indexProgress, importGraph, indexFileList, repoType, fullScan,
  } = useShinra();

  // Filters for which file types to show
  const [filters, setFilters] = useState({ js: true, ts: true, jsx: true, tsx: true, py: false, go: false, rs: false });

  // Auto-set filters based on repo type
  useEffect(() => {
    if (!repoType) return;
    const newFilters = { js: false, ts: false, jsx: false, tsx: false, py: false, go: false, rs: false };
    if (repoType === "node" || repoType === "mixed") {
      newFilters.js = true; newFilters.ts = true; newFilters.jsx = true; newFilters.tsx = true;
    }
    if (repoType === "python") newFilters.py = true;
    if (repoType === "go") newFilters.go = true;
    if (repoType === "rust") newFilters.rs = true;
    setFilters(newFilters);
  }, [repoType]);

  // Derive graph from shared index based on local filters
  const graph = useMemo(() => {
    if (!importGraph || !indexFileList.length) return null;

    const activeExts = new Set();
    if (filters.js) activeExts.add(".js");
    if (filters.ts) activeExts.add(".ts");
    if (filters.jsx) activeExts.add(".jsx");
    if (filters.tsx) activeExts.add(".tsx");
    if (filters.py) activeExts.add(".py");
    if (filters.go) activeExts.add(".go");
    if (filters.rs) activeExts.add(".rs");

    const filteredFiles = indexFileList.filter(fp => {
      const ext = extOf(fp.split("/").pop());
      return activeExts.has(ext);
    });
    const filteredSet = new Set(filteredFiles);

    const nodes = filteredFiles.map(fp => ({ id: fp, name: fp.split("/").pop() }));
    const edges = importGraph.edges.filter(e => filteredSet.has(e.from) && filteredSet.has(e.to));

    // Deduplicate edges
    const edgeSet = new Set();
    const uniqueEdges = [];
    for (const e of edges) {
      const key = `${e.from}|${e.to}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); uniqueEdges.push(e); }
    }

    const importMap = {};
    const importedByMap = {};
    for (const fp of filteredFiles) {
      importMap[fp] = (importGraph.importMap[fp] || []).filter(x => filteredSet.has(x));
      importedByMap[fp] = (importGraph.importedByMap[fp] || []).filter(x => filteredSet.has(x));
    }
    return { nodes, edges: uniqueEdges, importMap, importedByMap };
  }, [importGraph, indexFileList, filters]);

  const scanning = indexStatus === "scanning";

  // UI state
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [orphansExpanded, setOrphansExpanded] = useState(false);

  // Open file in editor from graph
  const handleOpenInEditor = useCallback((filePath) => {
    setOpenFiles((prev) => prev.includes(filePath) ? prev : [...prev, filePath]);
    setActiveFile(filePath);
    setActiveTab("editor");
  }, [setOpenFiles, setActiveFile, setActiveTab]);

  // ── Cycles + orphans (derived) ─────────────────────────────────────────────
  const cycles = useMemo(() => {
    if (!graph) return [];
    return findCycles(graph.nodes, graph.edges);
  }, [graph]);

  const cycleNodeSet = useMemo(() => {
    const s = new Set();
    for (const c of cycles) {
      for (const n of c) s.add(n);
    }
    return s;
  }, [cycles]);

  const cycleEdgeSet = useMemo(() => {
    const s = new Set();
    for (const c of cycles) {
      for (let i = 0; i < c.length - 1; i++) {
        s.add(`${c[i]}|${c[i + 1]}`);
      }
    }
    return s;
  }, [cycles]);

  const orphanNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter(n => {
      const imports = (graph.importMap[n.id] || []).length;
      const importedBy = (graph.importedByMap[n.id] || []).length;
      return imports === 0 && importedBy === 0;
    });
  }, [graph]);

  // ── Selected node info ─────────────────────────────────────────────────────
  const selectedInfo = useMemo(() => {
    if (!selectedNode || !graph) return null;
    const node = graph.nodes.find(n => n.id === selectedNode);
    if (!node) return null;
    return {
      node,
      imports: graph.importMap[selectedNode] || [],
      importedBy: graph.importedByMap[selectedNode] || [],
      isInCycle: cycleNodeSet.has(selectedNode),
      isOrphan: orphanNodes.some(n => n.id === selectedNode),
    };
  }, [selectedNode, graph, cycleNodeSet, orphanNodes]);

  // Connection count for file list
  const connectionCounts = useMemo(() => {
    if (!graph) return {};
    const counts = {};
    for (const n of graph.nodes) {
      counts[n.id] = (graph.importMap[n.id] || []).length + (graph.importedByMap[n.id] || []).length;
    }
    return counts;
  }, [graph]);

  // Sorted file list
  const sortedNodes = useMemo(() => {
    if (!graph) return [];
    return [...graph.nodes].sort((a, b) => (connectionCounts[b.id] || 0) - (connectionCounts[a.id] || 0));
  }, [graph, connectionCounts]);

  // ── Graph3D data transforms ─────────────────────────────────────────────────
  const diagramNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.map(n => {
      const { color, cat } = categorize(n.id);
      return { id: n.id, label: n.name, type: cat, color };
    });
  }, [graph]);

  const diagramEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges.map(e => ({
      from: e.from, to: e.to,
      color: cycleEdgeSet.has(`${e.from}|${e.to}`) ? T.red : undefined,
      dashed: cycleEdgeSet.has(`${e.from}|${e.to}`),
    }));
  }, [graph, cycleEdgeSet]);

  // Toggle a filter checkbox
  const toggleFilter = useCallback((ext) => {
    setFilters(prev => ({ ...prev, [ext]: !prev[ext] }));
  }, []);

  // ── No workingDir empty state ──────────────────────────────────────────────
  if (!workingDir) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 12, fontFamily: T.fontUI,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: T.bg3,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, color: T.txt3, border: `1px dashed ${T.border2}`,
        }}>
          &#x29BF;
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.txt }}>
          Open a project folder first
        </span>
        <span style={{ fontSize: 12, color: T.txt3, maxWidth: 280, textAlign: "center" }}>
          Use the file explorer to open a project directory, then scan it to visualize dependencies.
        </span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, display: "flex", overflow: "hidden",
      fontFamily: T.fontUI, background: T.bg0,
    }}>

      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <div style={{
        width: 260, flexShrink: 0, display: "flex", flexDirection: "column",
        background: T.bg1, borderRight: `1px solid ${T.border}`, overflow: "hidden",
      }}>
        <PanelHeader title="Dependencies" accent={T.cyan} count={graph ? graph.nodes.length : undefined} />

        {/* Controls */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
          {scanning ? (
            <div style={{ width: "100%", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: T.txt2, marginBottom: 4 }}>
                Indexing... {indexProgress.scanned}/{indexProgress.total} files
              </div>
              <div style={{ height: 4, background: T.bg3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: T.cyan,
                  width: indexProgress.total ? `${(indexProgress.scanned / indexProgress.total) * 100}%` : "0%",
                  transition: "width 0.2s",
                }} />
              </div>
            </div>
          ) : (
            <Btn
              variant="ghost"
              onClick={fullScan}
              style={{ width: "100%", justifyContent: "center", marginBottom: 10, fontSize: 10 }}
            >
              Re-scan Project
            </Btn>
          )}

          {/* File Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: T.txt2 }}>File Types</span>
            {repoType && (
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 4,
                background: `${T.teal}14`, border: `1px solid ${T.teal}30`,
                color: T.teal, fontWeight: 600, fontFamily: T.fontUI,
              }}>
                {repoType}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["js", "ts", "jsx", "tsx", "py", "go", "rs"].map(ext => (
              <label
                key={ext}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 10, color: filters[ext] ? T.txt : T.txt3,
                  cursor: "pointer", padding: "2px 8px", borderRadius: 4,
                  background: filters[ext] ? `${T.cyan}14` : T.bg3,
                  border: `1px solid ${filters[ext] ? `${T.cyan}40` : T.border}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={filters[ext]}
                  onChange={() => toggleFilter(ext)}
                  style={{ display: "none" }}
                />
                <span style={{
                  width: 10, height: 10, borderRadius: 2,
                  border: `1px solid ${filters[ext] ? T.cyan : T.txt3}`,
                  background: filters[ext] ? T.cyan : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 7, color: "#fff", fontWeight: 700,
                }}>
                  {filters[ext] ? "\u2713" : ""}
                </span>
                .{ext}
              </label>
            ))}
          </div>
        </div>

        {indexStatus === "error" && (
          <div style={{
            padding: "8px 12px", fontSize: 11, color: T.red, background: `${T.red}10`,
            borderBottom: `1px solid ${T.border}`,
          }}>
            Index error — try re-scanning
          </div>
        )}

        {/* File list */}
        <div style={{ flex: 1, overflow: "hidden auto", padding: "4px 0" }}>
          {sortedNodes.map(node => (
            <FileListItem
              key={node.id}
              fileId={node.id}
              node={node}
              connectionCount={connectionCounts[node.id] || 0}
              isSelected={selectedNode === node.id}
              onClick={setSelectedNode}
            />
          ))}
          {graph && graph.nodes.length === 0 && (
            <div style={{
              padding: "20px 12px", textAlign: "center", fontSize: 11, color: T.txt3,
            }}>
              No matching files found. Adjust filters and try again.
            </div>
          )}
        </div>

        {/* Summary footer */}
        {graph && (
          <div style={{
            padding: "8px 12px", borderTop: `1px solid ${T.border}`,
            display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            <Badge style={{ fontSize: 9 }}>{graph.nodes.length} files</Badge>
            <Badge style={{ fontSize: 9 }}>{graph.edges.length} imports</Badge>
            {cycles.length > 0 && (
              <Badge severity="critical" style={{ fontSize: 9 }}>
                {cycles.length} cycle{cycles.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Center Canvas — 3D Graph ────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", background: T.bg0 }}>

        {/* Info badge: node count + edge count — top-right */}
        {graph && (
          <div style={{
            position: "absolute", top: 10, right: 10, zIndex: 10,
            fontSize: 10, color: T.txt3, fontFamily: T.fontMono,
            background: T.bg1, border: `1px solid ${T.border}`,
            padding: "3px 10px", borderRadius: 4,
            pointerEvents: "none", userSelect: "none",
          }}>
            {graph.nodes.length} files &middot; {graph.edges.length} imports
          </div>
        )}

        {!graph ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", flexDirection: "column", gap: 8,
          }}>
            <span style={{ fontSize: 32, color: T.txt3 }}>&#x2B53;</span>
            <span style={{ fontSize: 13, color: T.txt3 }}>
              Click "Scan Project" to analyze dependencies
            </span>
          </div>
        ) : (
          <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.txt2, fontFamily: T.fontUI, fontSize: 13 }}>Loading 3D graph...</div>}>
            <Graph3D
              nodes={diagramNodes}
              edges={diagramEdges}
              selectedNode={selectedNode}
              onNodeClick={setSelectedNode}
              onNodeHover={setHoveredNode}
              style={{ flex: 1 }}
            />
          </Suspense>
        )}
      </div>

      {/* ── Right Panel ───────────────────────────────────────────────────── */}
      <div style={{
        width: 240, flexShrink: 0, display: "flex", flexDirection: "column",
        background: T.bg1, borderLeft: `1px solid ${T.border}`, overflow: "hidden",
      }}>
        <PanelHeader title="Details" accent={T.purple} />

        {selectedInfo ? (
          <div style={{ flex: 1, overflow: "hidden auto", padding: "10px 0" }}>

            {/* File info */}
            <div style={{ padding: "0 12px", marginBottom: 14 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: T.txt,
                marginBottom: 2, wordBreak: "break-all",
              }}>
                {selectedInfo.node.name}
              </div>
              <div style={{
                fontSize: 10, color: T.txt3, fontFamily: T.fontMono,
                wordBreak: "break-all", marginBottom: 10,
              }}>
                {shortName(selectedInfo.node.id, workingDir)}
              </div>

              {/* Category badge */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <Badge style={{
                  fontSize: 9,
                  background: `${categorize(selectedInfo.node.id).color}18`,
                  border: `1px solid ${categorize(selectedInfo.node.id).color}40`,
                  color: categorize(selectedInfo.node.id).color,
                }}>
                  {categorize(selectedInfo.node.id).label}
                </Badge>
                {selectedInfo.isInCycle && (
                  <Badge severity="critical" style={{ fontSize: 9 }}>Circular Dep</Badge>
                )}
                {selectedInfo.isOrphan && (
                  <Badge style={{
                    fontSize: 9,
                    background: `${T.amber}18`,
                    border: `1px solid ${T.amber}40`,
                    color: T.amber,
                  }}>
                    Orphan
                  </Badge>
                )}
              </div>

              {/* Stats */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
              }}>
                <div style={{
                  background: T.bg3, borderRadius: 6, padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, fontFamily: T.fontMono }}>
                    {selectedInfo.imports.length}
                  </div>
                  <div style={{ fontSize: 9, color: T.txt3 }}>Imports</div>
                </div>
                <div style={{
                  background: T.bg3, borderRadius: 6, padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, fontFamily: T.fontMono }}>
                    {selectedInfo.importedBy.length}
                  </div>
                  <div style={{ fontSize: 9, color: T.txt3 }}>Imported By</div>
                </div>
              </div>

              {/* Open in Editor */}
              <Btn
                variant="ghost"
                onClick={() => handleOpenInEditor(selectedNode)}
                style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 10 }}
              >
                Open in Editor
              </Btn>
            </div>

            {/* Imports list */}
            {selectedInfo.imports.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: T.txt2,
                  letterSpacing: 0.8, padding: "0 12px", marginBottom: 4,
                  textTransform: "uppercase",
                }}>
                  Imports ({selectedInfo.imports.length})
                </div>
                {selectedInfo.imports.map(imp => (
                  <ImportListItem
                    key={imp}
                    fileId={imp}
                    workingDir={workingDir}
                    onClick={setSelectedNode}
                  />
                ))}
              </div>
            )}

            {/* Imported-by list */}
            {selectedInfo.importedBy.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: T.txt2,
                  letterSpacing: 0.8, padding: "0 12px", marginBottom: 4,
                  textTransform: "uppercase",
                }}>
                  Imported By ({selectedInfo.importedBy.length})
                </div>
                {selectedInfo.importedBy.map(imp => (
                  <ImportListItem
                    key={imp}
                    fileId={imp}
                    workingDir={workingDir}
                    onClick={setSelectedNode}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 6, padding: "0 20px",
          }}>
            <span style={{ fontSize: 20, color: T.txt3 }}>&#x25CE;</span>
            <span style={{ fontSize: 11, color: T.txt3, textAlign: "center" }}>
              Select a node to see details
            </span>
          </div>
        )}

        {/* Health indicators */}
        {graph && (
          <div style={{
            borderTop: `1px solid ${T.border}`, padding: "10px 12px",
            flexShrink: 0, overflow: "hidden auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.txt2,
              letterSpacing: 0.8, marginBottom: 8,
              textTransform: "uppercase",
            }}>
              Health
            </div>

            {/* Health score gauge */}
            <HealthGauge score={Math.max(0, 100 - cycles.length * 15 - orphanNodes.length * 5)} />

            {/* Circular deps */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: cycles.length > 0 ? T.red : T.green,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11, color: cycles.length > 0 ? T.red : T.green,
                fontWeight: 600,
              }}>
                {cycles.length > 0
                  ? `${cycles.length} circular dep${cycles.length !== 1 ? "s" : ""}`
                  : "No circular deps"
                }
              </span>
            </div>

            {/* Orphan files — collapsible */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, cursor: orphanNodes.length > 0 ? "pointer" : "default",
              }}
              onClick={() => { if (orphanNodes.length > 0) setOrphansExpanded(prev => !prev); }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: orphanNodes.length > 0 ? T.amber : T.green,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11, color: orphanNodes.length > 0 ? T.amber : T.green,
                fontWeight: 600, flex: 1,
              }}>
                {orphanNodes.length > 0
                  ? `${orphanNodes.length} orphan file${orphanNodes.length !== 1 ? "s" : ""}`
                  : "No orphan files"
                }
              </span>
              {orphanNodes.length > 0 && (
                <span style={{
                  fontSize: 10, color: T.txt3,
                  transform: orphansExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                  display: "inline-block",
                }}>
                  &#x25B6;
                </span>
              )}
            </div>

            {/* Expanded orphan file list */}
            {orphansExpanded && orphanNodes.length > 0 && (
              <div style={{
                marginTop: 6, marginLeft: 16,
                borderLeft: `2px solid ${T.amber}30`,
                paddingLeft: 8,
                maxHeight: 120, overflowY: "auto",
              }}>
                {orphanNodes.map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNode(n.id)}
                    style={{
                      fontSize: 10, color: T.txt2, fontFamily: T.fontMono,
                      padding: "2px 0", cursor: "pointer",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={shortName(n.id, workingDir)}
                  >
                    {n.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

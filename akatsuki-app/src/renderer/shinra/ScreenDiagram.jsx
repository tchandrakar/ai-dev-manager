import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge } from "../components";
import { useShinra } from "./ShinraApp";

// ── Constants ────────────────────────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 40;

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

// Simple force-directed layout
function layoutNodes(nodes, edges) {
  if (nodes.length === 0) return [];

  // Compute in-degree for vertical layering
  const inDeg = {};
  const outDeg = {};
  for (const n of nodes) { inDeg[n.id] = 0; outDeg[n.id] = 0; }
  for (const e of edges) {
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
    if (outDeg[e.from] !== undefined) outDeg[e.from]++;
  }

  // Topological sort via Kahn's algorithm (best-effort for cycles)
  const adj = {};
  const inDegCopy = { ...inDeg };
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
  }

  const layers = [];
  const assigned = new Set();
  let frontier = nodes.filter(n => inDegCopy[n.id] === 0).map(n => n.id);
  if (frontier.length === 0) frontier = [nodes[0].id]; // break cycles

  while (frontier.length > 0 && assigned.size < nodes.length) {
    layers.push([...frontier]);
    for (const id of frontier) assigned.add(id);
    const next = new Set();
    for (const id of frontier) {
      for (const dep of (adj[id] || [])) {
        inDegCopy[dep]--;
        if (inDegCopy[dep] <= 0 && !assigned.has(dep)) next.add(dep);
      }
    }
    frontier = [...next];
    // Safety: if no progress, force unassigned nodes into next layer
    if (frontier.length === 0 && assigned.size < nodes.length) {
      frontier = nodes.filter(n => !assigned.has(n.id)).slice(0, 8).map(n => n.id);
    }
  }

  // Position nodes: layers top-to-bottom, spread horizontally
  const positions = {};
  const layerGapY = 90;
  const nodeGapX = 200;
  const startY = 60;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalW = layer.length * nodeGapX;
    const startX = Math.max(60, 400 - totalW / 2);
    for (let ni = 0; ni < layer.length; ni++) {
      positions[layer[ni]] = {
        x: startX + ni * nodeGapX,
        y: startY + li * layerGapY,
      };
    }
  }

  // Light force-based relaxation (push overlapping nodes apart)
  const pos = nodes.map(n => ({ ...positions[n.id], id: n.id }));
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 180;
        if (dist < minDist) {
          const force = (minDist - dist) * 0.3;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force * 0.3; // less vertical push
          pos[i].x -= fx;
          pos[j].x += fx;
          pos[i].y -= fy;
          pos[j].y += fy;
        }
      }
    }

    // Edge attraction
    for (const e of edges) {
      const a = pos.find(p => p.id === e.from);
      const b = pos.find(p => p.id === e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 180;
      const force = (dist - ideal) * 0.01;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.x += fx;
      a.y += fy;
      b.x -= fx;
      b.y -= fy;
    }
  }

  return pos.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) }));
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

function GraphNode({ node, pos, isSelected, isInCycle, isHovered, onClick, onMouseDown, onHover }) {
  const { color } = categorize(node.id);
  const name = node.name;
  const borderColor = isHovered ? T.blue : isSelected ? T.blue : isInCycle ? T.red : `${color}60`;
  const bgColor = isHovered ? `${T.blue}22` : isSelected ? `${T.blue}18` : isInCycle ? `${T.red}10` : `${color}10`;

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <rect
        x={-NODE_W / 2}
        y={-NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Color stripe on left */}
      <rect
        x={-NODE_W / 2}
        y={-NODE_H / 2 + 4}
        width={3}
        height={NODE_H - 8}
        rx={1.5}
        fill={isInCycle ? T.red : color}
      />
      <text
        x={0}
        y={-2}
        textAnchor="middle"
        fill={T.txt}
        fontSize={11}
        fontFamily={T.fontUI}
        fontWeight={600}
      >
        {name.length > 18 ? name.slice(0, 16) + "..." : name}
      </text>
      <text
        x={0}
        y={12}
        textAnchor="middle"
        fill={isInCycle ? T.red : color}
        fontSize={9}
        fontFamily={T.fontUI}
      >
        {categorize(node.id).label}
        {isInCycle ? " (cycle)" : ""}
      </text>
    </g>
  );
}

function GraphEdge({ from, to, isInCycle, highlighted }) {
  if (!from || !to) return null;

  const x1 = from.x;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y - NODE_H / 2;

  // Curved path
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  const strokeColor = isInCycle ? T.red : highlighted ? T.blue : T.border2;
  const strokeWidth = highlighted ? 2 : isInCycle ? 1.5 : 1;
  const opacity = highlighted ? 1 : isInCycle ? 0.9 : 0.5;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={isInCycle ? "4 3" : "none"}
        opacity={opacity}
      />
      {/* Arrowhead */}
      <polygon
        points={`${x2 - 4},${y2 - 7} ${x2},${y2} ${x2 + 4},${y2 - 7}`}
        fill={strokeColor}
        opacity={opacity}
      />
    </g>
  );
}

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
  const [positions, setPositions] = useState([]); // [{id, x, y}]

  // Pan / zoom
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const dragNodeId = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  // Auto-layout when graph changes
  useEffect(() => {
    if (graph && graph.nodes.length > 0) {
      const laid = layoutNodes(graph.nodes, graph.edges);
      setPositions(laid);
      setViewTransform({ x: 0, y: 0, scale: 1 });
    }
  }, [graph]);

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

  // ── Pan / zoom handlers ────────────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - viewTransform.x, y: e.clientY - viewTransform.y };
  }, [viewTransform]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (dragNodeId.current) {
      // Dragging a node
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const mx = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale;
      const my = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale;
      setPositions(prev => prev.map(p =>
        p.id === dragNodeId.current
          ? { ...p, x: Math.round(mx - dragOffset.current.x), y: Math.round(my - dragOffset.current.y) }
          : p
      ));
      return;
    }
    if (!isPanning.current) return;
    setViewTransform(prev => ({
      ...prev,
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    }));
  }, [viewTransform]);

  const handleCanvasMouseUp = useCallback(() => {
    isPanning.current = false;
    dragNodeId.current = null;
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewTransform(prev => {
      const newScale = Math.min(3, Math.max(0.15, prev.scale * delta));
      // Zoom toward mouse position
      const svgEl = svgRef.current;
      if (!svgEl) return { ...prev, scale: newScale };
      const rect = svgEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * (newScale / prev.scale),
        y: my - (my - prev.y) * (newScale / prev.scale),
      };
    });
  }, []);

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    dragNodeId.current = nodeId;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const mx = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale;
    const my = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale;
    const pos = positions.find(p => p.id === nodeId);
    if (pos) {
      dragOffset.current = { x: mx - pos.x, y: my - pos.y };
    }
  }, [viewTransform, positions]);

  // Attach wheel with passive:false
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Position lookup ────────────────────────────────────────────────────────
  const posMap = useMemo(() => {
    const m = {};
    for (const p of positions) m[p.id] = p;
    return m;
  }, [positions]);

  // ── Fit to view ────────────────────────────────────────────────────────────
  const fitToView = useCallback(() => {
    if (positions.length === 0) return;
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);
    const minX = Math.min(...xs) - NODE_W;
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys) - NODE_H;
    const maxY = Math.max(...ys) + NODE_H;
    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const scaleX = rect.width / graphW;
    const scaleY = rect.height / graphH;
    const scale = Math.min(scaleX, scaleY, 1.5) * 0.85;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewTransform({
      scale,
      x: rect.width / 2 - cx * scale,
      y: rect.height / 2 - cy * scale,
    });
  }, [positions]);

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

      {/* ── Center Canvas ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: T.bg0 }}>

        {/* Toolbar */}
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 10,
          display: "flex", gap: 6,
        }}>
          <Btn variant="ghost" onClick={fitToView} title="Fit to view"
            style={{ padding: "0 8px", height: 26, fontSize: 11 }}>
            Fit
          </Btn>
          <Btn variant="ghost" title="Zoom in"
            onClick={() => setViewTransform(prev => ({ ...prev, scale: Math.min(3, prev.scale * 1.25) }))}
            style={{ padding: "0 8px", height: 26, fontSize: 13 }}>
            +
          </Btn>
          <Btn variant="ghost" title="Zoom out"
            onClick={() => setViewTransform(prev => ({ ...prev, scale: Math.max(0.15, prev.scale * 0.8) }))}
            style={{ padding: "0 8px", height: 26, fontSize: 13 }}>
            -
          </Btn>
          <Btn variant="ghost" title="Reset view"
            onClick={() => setViewTransform({ x: 0, y: 0, scale: 1 })}
            style={{ padding: "0 8px", height: 26, fontSize: 11 }}>
            Reset
          </Btn>
        </div>

        {/* Zoom indicator */}
        <div style={{
          position: "absolute", bottom: 10, left: 10, zIndex: 10,
          fontSize: 10, color: T.txt3, fontFamily: T.fontMono,
          background: `${T.bg2}cc`, padding: "2px 8px", borderRadius: 4,
        }}>
          {Math.round(viewTransform.scale * 100)}%
        </div>

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
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ cursor: isPanning.current ? "grabbing" : "grab", display: "block" }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            {/* Dot grid pattern */}
            <defs>
              <pattern id="dotGrid" width={20} height={20} patternUnits="userSpaceOnUse">
                <circle cx={10} cy={10} r={0.8} fill={T.border} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotGrid)" />

            {/* Transformed group */}
            <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
              {/* Edges */}
              {graph.edges.map((edge, i) => {
                const isConnectedToHovered = hoveredNode && (edge.from === hoveredNode || edge.to === hoveredNode);
                const isConnectedToSelected = selectedNode && (edge.from === selectedNode || edge.to === selectedNode);
                return (
                  <GraphEdge
                    key={`${edge.from}|${edge.to}|${i}`}
                    from={posMap[edge.from]}
                    to={posMap[edge.to]}
                    isInCycle={cycleEdgeSet.has(`${edge.from}|${edge.to}`)}
                    highlighted={isConnectedToHovered || isConnectedToSelected}
                  />
                );
              })}

              {/* Nodes */}
              {graph.nodes.map(node => {
                const pos = posMap[node.id];
                if (!pos) return null;
                return (
                  <GraphNode
                    key={node.id}
                    node={node}
                    pos={pos}
                    isSelected={selectedNode === node.id}
                    isHovered={hoveredNode === node.id}
                    isInCycle={cycleNodeSet.has(node.id)}
                    onClick={setSelectedNode}
                    onMouseDown={handleNodeMouseDown}
                    onHover={setHoveredNode}
                  />
                );
              })}
            </g>
          </svg>
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
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.txt2,
              letterSpacing: 0.8, marginBottom: 8,
              textTransform: "uppercase",
            }}>
              Health
            </div>

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

            {/* Orphan files */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: orphanNodes.length > 0 ? T.amber : T.green,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11, color: orphanNodes.length > 0 ? T.amber : T.green,
                fontWeight: 600,
              }}>
                {orphanNodes.length > 0
                  ? `${orphanNodes.length} orphan file${orphanNodes.length !== 1 ? "s" : ""}`
                  : "No orphan files"
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

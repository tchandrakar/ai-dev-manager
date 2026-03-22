import React, { useState, useMemo, useRef, useCallback, Suspense, lazy } from "react";
import { T } from "../tokens";

// ── Lazy-load Three.js to avoid blocking initial render ────────────────────
const Canvas = lazy(() => import("@react-three/fiber").then(m => ({ default: m.Canvas })));
const ThreeScene = lazy(() => import("./Graph3DScene"));

// ── 3D Force-Directed Layout ───────────────────────────────────────────────

function layout3D(nodes, edges) {
  const n = nodes.length;
  if (n === 0) return new Map();

  const radius = Math.sqrt(n) * 8;

  // Initialize random positions on a sphere
  const pos = new Map();
  const vel = new Map();
  for (const node of nodes) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * Math.cbrt(Math.random());
    pos.set(node.id, {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
    });
    vel.set(node.id, { x: 0, y: 0, z: 0 });
  }

  // Build adjacency for fast edge lookups
  const edgeSet = new Set();
  for (const e of edges) {
    edgeSet.add(`${e.from}|${e.to}`);
    edgeSet.add(`${e.to}|${e.from}`);
  }

  const nodeIds = nodes.map(nd => nd.id);
  const IDEAL_DIST = 15;

  // Run 80 iterations
  for (let iter = 0; iter < 80; iter++) {
    // Repulsion: every pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(nodeIds[i]);
        const b = pos.get(nodeIds[j]);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const dist2 = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(dist2) || 0.01;
        const force = 200 / (dist2 + 1);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        const va = vel.get(nodeIds[i]);
        const vb = vel.get(nodeIds[j]);
        va.x += fx; va.y += fy; va.z += fz;
        vb.x -= fx; vb.y -= fy; vb.z -= fz;
      }
    }

    // Attraction: connected nodes pull toward ideal distance
    for (const e of edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const force = (dist - IDEAL_DIST) * 0.01;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      const va = vel.get(e.from);
      const vb = vel.get(e.to);
      if (va) { va.x += fx; va.y += fy; va.z += fz; }
      if (vb) { vb.x -= fx; vb.y -= fy; vb.z -= fz; }
    }

    // Centering + damping + apply velocity
    for (const id of nodeIds) {
      const p = pos.get(id);
      const v = vel.get(id);

      // Gentle centering pull
      v.x -= p.x * 0.01;
      v.y -= p.y * 0.01;
      v.z -= p.z * 0.01;

      // Damping
      v.x *= 0.9;
      v.y *= 0.9;
      v.z *= 0.9;

      // Apply
      p.x += v.x;
      p.y += v.y;
      p.z += v.z;
    }
  }

  return pos;
}

// ── Zoom Controls Overlay ──────────────────────────────────────────────────

function ZoomControls({ onZoomIn, onZoomOut, onReset, showLabels, onToggleLabels, showGrid, onToggleGrid }) {
  const btnStyle = (hovered) => ({
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: hovered ? T.bg3 : T.bg2,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    color: T.txt,
    fontSize: 14,
    fontFamily: T.fontUI,
    cursor: "pointer",
    outline: "none",
    transition: "background 0.15s ease",
  });

  const toggleStyle = (active, hovered) => ({
    height: 24,
    padding: "0 8px",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? `${T.blue}20` : (hovered ? T.bg3 : T.bg2),
    border: `1px solid ${active ? T.blue + "60" : T.border}`,
    borderRadius: 6,
    color: active ? T.blue : T.txt2,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: T.fontUI,
    cursor: "pointer",
    outline: "none",
    transition: "all 0.15s ease",
    letterSpacing: 0.3,
  });

  return (
    <div style={{
      position: "absolute", bottom: 12, right: 12,
      display: "flex", flexDirection: "column", gap: 4,
      zIndex: 10,
    }}>
      <div style={{ display: "flex", gap: 4 }}>
        <HoverButton style={btnStyle} onClick={onZoomIn} title="Zoom in">+</HoverButton>
        <HoverButton style={btnStyle} onClick={onZoomOut} title="Zoom out">&minus;</HoverButton>
        <HoverButton style={btnStyle} onClick={onReset} title="Reset view">&#x27F3;</HoverButton>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <HoverToggle style={toggleStyle} active={showLabels} onClick={onToggleLabels}>Labels</HoverToggle>
        <HoverToggle style={toggleStyle} active={showGrid} onClick={onToggleGrid}>Grid</HoverToggle>
      </div>
    </div>
  );
}

function HoverButton({ style, onClick, title, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      style={style(hov)}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}

function HoverToggle({ style, active, onClick, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      style={style(active, hov)}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}

// ── Loading Fallback ───────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%",
      background: T.bg0,
      color: T.txt2,
      fontFamily: T.fontUI,
      fontSize: 13,
    }}>
      Loading 3D graph...
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────────

export default function Graph3D({
  nodes = [],
  edges = [],
  selectedNode = null,
  onNodeClick,
  onNodeHover,
  highlightedNodes = null,
  style,
}) {
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Compute layout — memoized on topology changes
  const positions = useMemo(
    () => layout3D(nodes, edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, edges.length]
  );

  // Build connected set for selected node
  const connectedEdgeKeys = useMemo(() => {
    if (!selectedNode) return new Set();
    const keys = new Set();
    for (const e of edges) {
      if (e.from === selectedNode || e.to === selectedNode) {
        keys.add(`${e.from}|${e.to}`);
      }
    }
    return keys;
  }, [selectedNode, edges]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    const dir = cam.position.clone().normalize();
    cam.position.addScaledVector(dir, -10);
    controls.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    const dir = cam.position.clone().normalize();
    cam.position.addScaledVector(dir, 10);
    controls.update();
  }, []);

  const handleReset = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    cam.position.set(0, 0, 80);
    cam.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          camera={{ position: [0, 0, 80], fov: 60, near: 0.1, far: 1000 }}
          style={{ background: T.bg0 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ camera }) => { cameraRef.current = camera; }}
        >
          <ThreeScene
            nodes={nodes}
            edges={edges}
            positions={positions}
            selectedNode={selectedNode}
            onNodeClick={onNodeClick}
            onNodeHover={onNodeHover}
            highlightedNodes={highlightedNodes}
            connectedEdgeKeys={connectedEdgeKeys}
            showLabels={showLabels}
            showGrid={showGrid}
            controlsRef={controlsRef}
          />
        </Canvas>
      </Suspense>
      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels(v => !v)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(v => !v)}
      />
    </div>
  );
}

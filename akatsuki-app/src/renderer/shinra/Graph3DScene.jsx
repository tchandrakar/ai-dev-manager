import React, { useState, useMemo, useRef, useCallback, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";

// ── Node3D ─────────────────────────────────────────────────────────────────

const Node3D = memo(function Node3D({
  id,
  label,
  color,
  position,
  isSelected,
  isHighlighted,
  baseSize,
  showLabel,
  nodeCount,
  onNodeClick,
  onNodeHover,
}) {
  const meshRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);
  const targetScale = useRef(1);

  // Adjust sphere segments for large graphs
  const segments = nodeCount > 200 ? 16 : 24;

  // Determine radius
  const radius = isSelected ? 2.2 : isHighlighted ? 2.0 : (baseSize || 1.5);

  // Update target scale on hover
  targetScale.current = hovered ? 1.3 : 1;

  // Animate scale + glow pulse
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const s = meshRef.current.scale.x;
    const t = targetScale.current;
    if (Math.abs(s - t) > 0.01) {
      const next = THREE.MathUtils.lerp(s, t, Math.min(delta * 10, 1));
      meshRef.current.scale.setScalar(next);
    }

    // Pulse glow for highlighted nodes
    if (glowRef.current && isHighlighted) {
      glowRef.current.intensity = 1.5 + Math.sin(Date.now() * 0.005) * 0.8;
    }
  });

  const handlePointerOver = useCallback((e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
    if (onNodeHover) onNodeHover(id);
  }, [id, onNodeHover]);

  const handlePointerOut = useCallback((e) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "auto";
    if (onNodeHover) onNodeHover(null);
  }, [onNodeHover]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (onNodeClick) onNodeClick(id);
  }, [id, onNodeClick]);

  return (
    <group position={position}>
      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[radius, segments, segments]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 1 : 0.85}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius + 0.6, radius + 1.0, 32]} />
          <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.7} />
        </mesh>
      )}

      {/* Highlight glow for NL search matches */}
      {isHighlighted && (
        <pointLight
          ref={glowRef}
          color={color}
          intensity={1.5}
          distance={12}
          decay={2}
        />
      )}

      {/* Label */}
      {showLabel && (
        <Billboard position={[0, -(radius + 1), 0]}>
          <Text
            fontSize={0.8}
            color="#ffffff"
            maxWidth={12}
            anchorY="top"
            anchorX="center"
            font={undefined}
            outlineWidth={0.06}
            outlineColor="#000000"
          >
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
});

// ── Edge3D ─────────────────────────────────────────────────────────────────

const Edge3D = memo(function Edge3D({
  from,
  to,
  color,
  dashed,
  isConnected,
}) {
  // Compute quadratic bezier curve with a perpendicular offset at the midpoint
  const points = useMemo(() => {
    const start = new THREE.Vector3(from[0], from[1], from[2]);
    const end = new THREE.Vector3(to[0], to[1], to[2]);

    // Midpoint
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);

    // Perpendicular offset — cross with up vector (or right if parallel to up)
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const up = new THREE.Vector3(0, 1, 0);
    let perp = new THREE.Vector3().crossVectors(dir, up);
    if (perp.length() < 0.01) {
      perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0));
    }
    perp.normalize().multiplyScalar(len * 0.1);
    mid.add(perp);

    // Sample 20 points along the quadratic bezier
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const t1 = 1 - t;
      pts.push(new THREE.Vector3(
        t1 * t1 * start.x + 2 * t1 * t * mid.x + t * t * end.x,
        t1 * t1 * start.y + 2 * t1 * t * mid.y + t * t * end.y,
        t1 * t1 * start.z + 2 * t1 * t * mid.z + t * t * end.z,
      ));
    }
    return pts;
  }, [from, to]);

  const lineColor = color || "#4A5568";
  const lineWidth = isConnected ? 2 : 1;
  const opacity = isConnected ? 0.8 : 0.4;

  if (dashed) {
    return (
      <Line
        points={points}
        color={lineColor}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
        dashed
        dashScale={5}
        dashSize={2}
        gapSize={1}
      />
    );
  }

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={lineWidth}
      transparent
      opacity={opacity}
    />
  );
});

// ── ThreeScene (default export, lazy-loaded by Graph3D) ────────────────────

export default function ThreeScene({
  nodes,
  edges,
  positions,
  selectedNode,
  onNodeClick,
  onNodeHover,
  highlightedNodes,
  connectedEdgeKeys,
  showLabels,
  showGrid,
  controlsRef,
}) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[50, 50, 50]} intensity={0.8} />
      <pointLight position={[-50, -50, -50]} intensity={0.3} />

      {/* Orbit controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={300}
      />

      {/* Grid plane */}
      {showGrid && (
        <gridHelper
          args={[200, 40, "#1a2235", "#1a2235"]}
          position={[0, -20, 0]}
          material-transparent
          material-opacity={0.3}
        />
      )}

      {/* Edges */}
      {edges.map((edge) => {
        const fromPos = positions.get(edge.from);
        const toPos = positions.get(edge.to);
        if (!fromPos || !toPos) return null;
        const key = `${edge.from}|${edge.to}`;
        const isConnected = connectedEdgeKeys.has(key);
        return (
          <Edge3D
            key={key}
            from={[fromPos.x, fromPos.y, fromPos.z]}
            to={[toPos.x, toPos.y, toPos.z]}
            color={edge.color}
            dashed={edge.dashed}
            isConnected={isConnected}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const p = positions.get(node.id);
        if (!p) return null;
        const isSelected = selectedNode === node.id;
        const isHighlighted = highlightedNodes ? highlightedNodes.has(node.id) : false;
        return (
          <Node3D
            key={node.id}
            id={node.id}
            label={node.label}
            color={node.color}
            position={[p.x, p.y, p.z]}
            isSelected={isSelected}
            isHighlighted={isHighlighted}
            baseSize={node.size}
            showLabel={showLabels}
            nodeCount={nodes.length}
            onNodeClick={onNodeClick}
            onNodeHover={onNodeHover}
          />
        );
      })}
    </>
  );
}

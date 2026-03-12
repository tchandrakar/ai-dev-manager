import React, { useState, useMemo } from "react";
import { T } from "../tokens";
import { PanelHeader } from "../components";
import { useKawaii } from "./KawaiiApp";
import { DB_TYPES } from "./mockData";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateChartData(points, baseFn, noise, scale) {
  const data = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const val = baseFn(t) + (Math.sin(i * 1.7) * noise * 0.5 + Math.sin(i * 3.1) * noise * 0.3 + Math.cos(i * 0.8) * noise * 0.2);
    data.push(Math.max(0, val * scale));
  }
  return data;
}

function dataToPath(data, width, height, maxVal, offsetX, offsetY) {
  const stepX = width / (data.length - 1);
  return data
    .map((v, i) => {
      const x = offsetX + i * stepX;
      const y = offsetY + height - (v / maxVal) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function dataToAreaPath(data, width, height, maxVal, offsetX, offsetY) {
  const linePath = dataToPath(data, width, height, maxVal, offsetX, offsetY);
  const stepX = width / (data.length - 1);
  const lastX = offsetX + (data.length - 1) * stepX;
  const baseY = offsetY + height;
  return `${linePath} L${lastX.toFixed(1)},${baseY.toFixed(1)} L${offsetX.toFixed(1)},${baseY.toFixed(1)} Z`;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ accentColor, label, value, valueSuffix, trend, trendColor, children }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 200,
        maxWidth: 400,
        height: 80,
        background: T.bg1,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      {/* Accent bar */}
      <div style={{ width: 3, background: accentColor, flexShrink: 0, borderRadius: "8px 0 0 8px" }} />

      <div style={{ flex: 1, padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
        {/* Label */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: T.txt2, fontFamily: T.fontUI, textTransform: "uppercase" }}>
          {label}
        </div>

        {/* Value row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: accentColor === T.teal ? T.teal : T.txt, fontFamily: T.fontMono, lineHeight: 1 }}>
            {value}
          </span>
          {valueSuffix && (
            <span style={{ fontSize: 12, color: T.txt3, fontFamily: T.fontUI }}>{valueSuffix}</span>
          )}
        </div>

        {/* Trend / children */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: T.fontUI }}>
          {trend && (
            <span style={{ color: trendColor || T.green }}>
              {trend}
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Time Range Pill ──────────────────────────────────────────────────────────

function TimePill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px",
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: T.fontUI,
        cursor: "pointer",
        border: active ? `1px solid ${T.teal}40` : `1px solid transparent`,
        background: active ? `${T.teal}18` : "transparent",
        color: active ? T.teal : T.txt3,
        outline: "none",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ── Query Performance Chart ──────────────────────────────────────────────────

function QueryPerformanceChart() {
  const [range, setRange] = useState("24H");
  const ranges = ["1H", "6H", "24H", "7D"];

  const chartW = 680;
  const chartH = 220;
  const padL = 50;
  const padR = 10;
  const padT = 10;
  const padB = 30;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  const pointsMap = { "1H": 12, "6H": 24, "24H": 48, "7D": 56 };
  const xLabelSets = {
    "1H": ["0m", "10m", "20m", "30m", "40m", "50m", "Now"],
    "6H": ["6h ago", "5h", "4h", "3h", "2h", "1h", "Now"],
    "24H": ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "Now"],
    "7D": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Now"],
  };

  const { avgData, p95Data } = useMemo(() => {
    const numPoints = pointsMap[range] || 48;
    const rng = seededRandom(range.charCodeAt(0) * 137);
    const avg = generateChartData(
      numPoints,
      (t) => 0.3 + 0.15 * Math.sin(t * Math.PI * 2) + 0.1 * Math.sin(t * Math.PI * 4),
      0.08 + rng() * 0.04,
      1
    );
    const p95 = generateChartData(
      numPoints,
      (t) => 0.6 + 0.2 * Math.sin(t * Math.PI * 2 + 0.5) + 0.12 * Math.cos(t * Math.PI * 3),
      0.12 + rng() * 0.05,
      1
    );
    return {
      avgData: avg.map((v) => v * 100 + 20),
      p95Data: p95.map((v) => v * 150 + 50),
    };
  }, [range]);

  const maxVal = 200;
  const yLabels = ["200ms", "150ms", "100ms", "50ms", "0ms"];
  const xLabels = xLabelSets[range] || xLabelSets["24H"];

  const avgPath = dataToPath(avgData, drawW, drawH, maxVal, padL, padT);
  const avgAreaPath = dataToAreaPath(avgData, drawW, drawH, maxVal, padL, padT);
  const p95Path = dataToPath(p95Data, drawW, drawH, maxVal, padL, padT);

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 400,
        background: T.bg1,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelHeader title="Query Performance" accent={T.teal}>
        <div style={{ display: "flex", gap: 4 }}>
          {ranges.map((r) => (
            <TimePill key={r} label={r} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </PanelHeader>

      <div style={{ flex: 1, padding: "16px 16px 10px 16px" }}>
        <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yLabels.map((_, i) => {
            const y = padT + (i / (yLabels.length - 1)) * drawH;
            return (
              <line
                key={i}
                x1={padL}
                y1={y}
                x2={padL + drawW}
                y2={y}
                stroke={T.border}
                strokeWidth={0.5}
                strokeDasharray="4 3"
                opacity={0.5}
              />
            );
          })}

          {/* Y-axis labels */}
          {yLabels.map((label, i) => {
            const y = padT + (i / (yLabels.length - 1)) * drawH;
            return (
              <text key={i} x={padL - 8} y={y + 3} fill={T.txt3} fontSize={9} fontFamily={T.fontMono} textAnchor="end">
                {label}
              </text>
            );
          })}

          {/* X-axis labels */}
          {xLabels.map((label, i) => {
            const x = padL + (i / (xLabels.length - 1)) * drawW;
            return (
              <text key={i} x={x} y={padT + drawH + 18} fill={T.txt3} fontSize={9} fontFamily={T.fontMono} textAnchor="middle">
                {label}
              </text>
            );
          })}

          {/* Avg area fill */}
          <path d={avgAreaPath} fill={T.teal} opacity={0.05} />

          {/* Avg line */}
          <path d={avgPath} fill="none" stroke={T.teal} strokeWidth={2} />

          {/* P95 line (dashed) */}
          <path d={p95Path} fill="none" stroke={T.amber} strokeWidth={1.5} strokeDasharray="6 4" />
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={20} height={2}>
              <line x1={0} y1={1} x2={20} y2={1} stroke={T.teal} strokeWidth={2} />
            </svg>
            <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>Avg Query Time</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={20} height={2}>
              <line x1={0} y1={1} x2={20} y2={1} stroke={T.amber} strokeWidth={1.5} strokeDasharray="4 3" />
            </svg>
            <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>p95 Latency</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Donut Chart Segment (named sub-component for .map) ───────────────────────

function DonutSegment({ cx, cy, radius, strokeW, color, dasharray, dashoffset }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={strokeW}
      strokeDasharray={dasharray}
      strokeDashoffset={dashoffset}
      strokeLinecap="butt"
      transform={`rotate(-90 ${cx} ${cy})`}
      style={{ transition: "stroke-dasharray 0.3s" }}
    />
  );
}

// ── Donut Legend Row (named sub-component for .map) ──────────────────────────

function DonutLegendRow({ type, pct, count, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: T.txt, fontFamily: T.fontUI, minWidth: 60 }}>{type}</span>
      <span style={{ fontSize: 12, color: T.txt2, fontFamily: T.fontUI, minWidth: 36, textAlign: "right" }}>{pct}%</span>
      <span style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontMono }}>{count.toLocaleString()}</span>
    </div>
  );
}

// ── Donut Chart: Queries by Type ─────────────────────────────────────────────

function QueriesByTypeChart({ connectionCount }) {
  const radius = 70;
  const strokeW = 20;
  const circumference = 2 * Math.PI * radius;
  const cx = 100;
  const cy = 100;
  const svgSize = 200;

  // Simulate query type distribution based on connection count for variability
  const stats = useMemo(() => {
    const rng = seededRandom(connectionCount * 31 + 7);
    const selectPct = 48 + Math.floor(rng() * 10);
    const insertPct = 18 + Math.floor(rng() * 8);
    const updatePct = 12 + Math.floor(rng() * 8);
    const deletePct = 3 + Math.floor(rng() * 5);
    const otherPct = 100 - selectPct - insertPct - updatePct - deletePct;
    const totalQueries = 1000 + Math.floor(rng() * 8000);
    return [
      { type: "SELECT", pct: selectPct, count: Math.round(totalQueries * selectPct / 100), color: T.blue },
      { type: "INSERT", pct: insertPct, count: Math.round(totalQueries * insertPct / 100), color: T.green },
      { type: "UPDATE", pct: updatePct, count: Math.round(totalQueries * updatePct / 100), color: T.amber },
      { type: "DELETE", pct: deletePct, count: Math.round(totalQueries * deletePct / 100), color: T.red },
      { type: "Other",  pct: otherPct,  count: Math.round(totalQueries * otherPct / 100),  color: T.purple },
    ];
  }, [connectionCount]);

  const totalQueries = useMemo(() => stats.reduce((sum, s) => sum + s.count, 0), [stats]);
  const totalLabel = totalQueries >= 1000 ? `${(totalQueries / 1000).toFixed(1)}K` : String(totalQueries);

  // Build segments
  const segments = useMemo(() => {
    let accumulatedOffset = 0;
    return stats.map((stat) => {
      const segLen = (stat.pct / 100) * circumference;
      const gap = 2;
      const dashLen = Math.max(0, segLen - gap);
      const seg = {
        ...stat,
        dasharray: `${dashLen} ${circumference - dashLen}`,
        dashoffset: -accumulatedOffset,
      };
      accumulatedOffset += segLen;
      return seg;
    });
  }, [stats, circumference]);

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 400,
        background: T.bg1,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelHeader title="Queries by Type" accent={T.blue} />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 40 }}>
        {/* Donut SVG */}
        <div style={{ position: "relative", width: svgSize, height: svgSize, flexShrink: 0 }}>
          <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke={T.bg3} strokeWidth={strokeW} />

            {/* Segments */}
            {segments.map((seg) => (
              <DonutSegment
                key={seg.type}
                cx={cx}
                cy={cy}
                radius={radius}
                strokeW={strokeW}
                color={seg.color}
                dasharray={seg.dasharray}
                dashoffset={seg.dashoffset}
              />
            ))}
          </svg>

          {/* Center text */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: T.txt, fontFamily: T.fontMono, lineHeight: 1 }}>{totalLabel}</div>
            <div style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI, marginTop: 2 }}>total queries</div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.map((stat) => (
            <DonutLegendRow
              key={stat.type}
              type={stat.type}
              pct={stat.pct}
              count={stat.count}
              color={stat.color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Active Queries Table ─────────────────────────────────────────────────────

function ActiveQueriesTable() {
  const headers = ["PID", "USER", "DATABASE", "QUERY", "DURATION", "STATE", "ACTIONS"];
  const colWidths = ["60px", "90px", "90px", "1fr", "80px", "90px", "60px"];

  return (
    <div
      style={{
        flex: "2.2 1 0",
        minWidth: 500,
        background: T.bg1,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: 460,
      }}
    >
      <PanelHeader title="Active Queries" accent={T.green}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 9,
            fontSize: 10,
            fontWeight: 600,
            background: `${T.txt3}18`,
            border: `1px solid ${T.txt3}40`,
            color: T.txt3,
            fontFamily: T.fontUI,
          }}
        >
          0 running
        </span>
      </PanelHeader>

      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: colWidths.join(" "),
            padding: "8px 12px",
            borderBottom: `1px solid ${T.border}`,
            background: T.bg2,
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          {headers.map((h) => (
            <span
              key={h}
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                color: T.txt3,
                fontFamily: T.fontUI,
                textTransform: "uppercase",
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Empty state */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 20px",
            gap: 8,
          }}
        >
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
            <circle cx={12} cy={12} r={10} stroke={T.txt3} strokeWidth={1.5} strokeDasharray="3 3" />
            <path d="M8 12h8M12 8v8" stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
          </svg>
          <span style={{ fontSize: 13, color: T.txt2, fontFamily: T.fontUI, fontWeight: 500 }}>
            No active queries
          </span>
          <span style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
            Active queries will appear here in real time
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Server Info Row (named sub-component for .map) ──────────────────────────

function ServerInfoRow({ label, value, valueColor, progress, progressColor, isLast }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: isLast ? "none" : `1px solid ${T.border}30`,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: T.txt2, fontFamily: T.fontUI, flexShrink: 0 }}>{label}</span>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {progress !== undefined && (
          <div
            style={{
              width: 130,
              height: 4,
              borderRadius: 2,
              background: T.bg3,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                borderRadius: 2,
                background: progressColor || T.teal,
                transition: "width 0.3s",
              }}
            />
          </div>
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: valueColor || T.txt,
            fontFamily: T.fontMono,
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Server Info Panel ────────────────────────────────────────────────────────

function ServerInfoPanel({ activeConnection }) {
  const serverInfo = useMemo(() => {
    if (!activeConnection) return [];

    const dbInfo = DB_TYPES[activeConnection.type];
    const dbLabel = dbInfo ? dbInfo.label : activeConnection.type;
    const version = activeConnection.version || dbLabel;

    return [
      { label: "Server", value: version },
      { label: "Connection", value: activeConnection.name },
      { label: "Database", value: activeConnection.database || "--" },
      { label: "Host", value: activeConnection.host || "--" },
      { label: "Uptime", value: "-- pending --" },
      { label: "Buffer Pool", value: "-- / --", progress: 0, progressColor: T.green },
      { label: "Slow Queries", value: "--", valueColor: T.txt3 },
      { label: "Connections Used", value: "--", progress: 0, progressColor: T.teal },
    ];
  }, [activeConnection]);

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 300,
        maxWidth: 520,
        background: T.bg1,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: 460,
      }}
    >
      <PanelHeader title="Server Info" accent={T.cyan} />

      <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {serverInfo.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 20px",
              color: T.txt3,
              fontSize: 12,
              fontFamily: T.fontUI,
            }}
          >
            Connect to a database to view server info
          </div>
        ) : (
          serverInfo.map((row, idx) => (
            <ServerInfoRow
              key={row.label}
              label={row.label}
              value={row.value}
              valueColor={row.valueColor}
              progress={row.progress}
              progressColor={row.progressColor}
              isLast={idx === serverInfo.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── No Connection Empty State ────────────────────────────────────────────────

function NoConnectionState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 40,
      }}
    >
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none">
        <rect x={3} y={3} width={18} height={18} rx={4} stroke={T.txt3} strokeWidth={1.5} strokeDasharray="4 3" />
        <path d="M8 12h8" stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round" />
        <path d="M12 8v8" stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.txt2, fontFamily: T.fontUI, marginBottom: 6 }}>
          No Active Connection
        </div>
        <div style={{ fontSize: 12, color: T.txt3, fontFamily: T.fontUI, lineHeight: 1.5 }}>
          Select a connection from the dropdown above or go to the Connections tab to get started.
        </div>
      </div>
    </div>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

function ScreenDashboard() {
  const { activeConnection, connections } = useKawaii();

  const connectionCount = connections ? connections.length : 0;
  const onlineCount = connections ? connections.filter((c) => c.status === "online").length : 0;

  // Simulated metrics derived from real state
  const metrics = useMemo(() => {
    const rng = seededRandom(connectionCount * 17 + 42);
    const queriesPerSec = Math.floor(200 + rng() * 1800);
    const avgQueryTime = Math.floor(10 + rng() * 40);
    const p95 = Math.floor(avgQueryTime * 2.5 + rng() * 80);
    const diskUsed = +(20 + rng() * 60).toFixed(1);
    const diskTotal = 100;
    const diskPct = Math.round((diskUsed / diskTotal) * 100);

    return {
      queriesPerSec: queriesPerSec.toLocaleString(),
      avgQueryTime: `${avgQueryTime}ms`,
      p95: `p95: ${p95}ms`,
      diskUsed,
      diskTotal,
      diskPct,
    };
  }, [connectionCount]);

  if (!activeConnection) {
    return (
      <div
        className="screen-enter"
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          background: T.bg0,
        }}
      >
        <NoConnectionState />
      </div>
    );
  }

  return (
    <div
      className="screen-enter"
      style={{
        flex: 1,
        overflow: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: T.bg0,
      }}
    >
      {/* ── Metrics Strip ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MetricCard
          accentColor={T.green}
          label="Active Connections"
          value={String(onlineCount)}
          valueSuffix={`/ ${connectionCount} total`}
          trend={connectionCount > 0 ? `${connectionCount} configured` : null}
          trendColor={T.txt3}
        />

        <MetricCard
          accentColor={T.teal}
          label="Queries / Sec"
          value={metrics.queriesPerSec}
          valueSuffix="avg last 5m"
        />

        <MetricCard
          accentColor={T.blue}
          label="Avg Query Time"
          value={metrics.avgQueryTime}
          valueSuffix={metrics.p95}
        />

        <MetricCard accentColor={T.amber} label="Disk Usage" value={String(metrics.diskUsed)} valueSuffix="GB">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 200, height: 4, borderRadius: 2, background: T.bg3, overflow: "hidden" }}>
                <div style={{ width: `${metrics.diskPct}%`, height: "100%", borderRadius: 2, background: T.amber }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: T.fontUI }}>
              <span style={{ color: T.txt3 }}>of {metrics.diskTotal} GB</span>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* ── Charts Row 1 ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <QueryPerformanceChart />
        <QueriesByTypeChart connectionCount={connectionCount} />
      </div>

      {/* ── Charts Row 2 ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <ActiveQueriesTable />
        <ServerInfoPanel activeConnection={activeConnection} />
      </div>
    </div>
  );
}

export default ScreenDashboard;

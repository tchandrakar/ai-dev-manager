import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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

function QueryPerformanceChart({ realMetrics }) {
  const [range, setRange] = useState("Live");
  const ranges = ["Live"];
  const samplesRef = useRef([]);

  // Accumulate real metric snapshots (keep last 60 = ~10 minutes at 10s intervals)
  useEffect(() => {
    if (realMetrics) {
      samplesRef.current = [...samplesRef.current, {
        queriesPerSec: realMetrics.queriesPerSec || 0,
        avgQueryTime: realMetrics.avgQueryTime || 0,
        ts: Date.now(),
      }].slice(-60);
    }
  }, [realMetrics]);

  const chartW = 680;
  const chartH = 220;
  const padL = 50;
  const padR = 10;
  const padT = 10;
  const padB = 30;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  const { avgData, qpsData } = useMemo(() => {
    const samples = samplesRef.current;
    if (samples.length < 2) {
      // Not enough real data yet — show flat line at current value
      const val = realMetrics?.avgQueryTime || 0;
      const qps = realMetrics?.queriesPerSec || 0;
      return { avgData: Array(10).fill(val || 1), qpsData: Array(10).fill(qps || 1) };
    }
    return {
      avgData: samples.map((s) => s.avgQueryTime),
      qpsData: samples.map((s) => s.queriesPerSec),
    };
  }, [realMetrics]);

  const maxVal = Math.max(10, ...avgData, ...qpsData.map((v) => v * 0.1)) * 1.2;
  const yMax = Math.ceil(maxVal / 10) * 10;
  const yLabels = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0].map((v) => `${v}ms`);

  // Time labels for live mode
  const numPts = avgData.length;
  const xLabels = numPts <= 10
    ? Array.from({ length: Math.min(7, numPts) }, (_, i) => i === Math.min(6, numPts - 1) ? "Now" : `${Math.round((numPts - 1 - i * (numPts / 7)) * 10)}s ago`).reverse()
    : ["5m ago", "4m", "3m", "2m", "1m", "30s", "Now"];

  const avgPath = dataToPath(avgData, drawW, drawH, yMax, padL, padT);
  const avgAreaPath = dataToAreaPath(avgData, drawW, drawH, yMax, padL, padT);
  const qpsScaled = qpsData.map((v) => v * 0.1); // scale qps to fit chart
  const qpsPath = dataToPath(qpsScaled, drawW, drawH, yMax, padL, padT);

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

          {/* Queries/sec line (dashed, scaled) */}
          <path d={qpsPath} fill="none" stroke={T.amber} strokeWidth={1.5} strokeDasharray="6 4" />
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={20} height={2}>
              <line x1={0} y1={1} x2={20} y2={1} stroke={T.teal} strokeWidth={2} />
            </svg>
            <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>Avg Query Time (ms)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width={20} height={2}>
              <line x1={0} y1={1} x2={20} y2={1} stroke={T.amber} strokeWidth={1.5} strokeDasharray="4 3" />
            </svg>
            <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>Queries/sec (scaled)</span>
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

function QueriesByTypeChart({ queryStats }) {
  const radius = 70;
  const strokeW = 20;
  const circumference = 2 * Math.PI * radius;
  const cx = 100;
  const cy = 100;
  const svgSize = 200;

  const stats = useMemo(() => {
    const s = queryStats || { select: 0, insert: 0, update: 0, delete: 0 };
    const total = s.select + s.insert + s.update + s.delete;
    if (total === 0) {
      return [
        { type: "SELECT", pct: 0, count: 0, color: T.blue },
        { type: "INSERT", pct: 0, count: 0, color: T.green },
        { type: "UPDATE", pct: 0, count: 0, color: T.amber },
        { type: "DELETE", pct: 0, count: 0, color: T.red },
      ];
    }
    return [
      { type: "SELECT", pct: Math.round(s.select / total * 100), count: s.select, color: T.blue },
      { type: "INSERT", pct: Math.round(s.insert / total * 100), count: s.insert, color: T.green },
      { type: "UPDATE", pct: Math.round(s.update / total * 100), count: s.update, color: T.amber },
      { type: "DELETE", pct: Math.round(s.delete / total * 100), count: s.delete, color: T.red },
    ];
  }, [queryStats]);

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

function ActiveQueryRow({ q }) {
  const durSec = parseInt(q.duration) || 0;
  const durColor = durSec > 10 ? T.red : durSec > 3 ? T.amber : T.green;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 90px 90px 1fr 80px 90px",
        padding: "6px 12px",
        borderBottom: `1px solid ${T.border}30`,
        fontSize: 11,
        fontFamily: T.fontMono,
        color: T.txt2,
        alignItems: "center",
      }}
    >
      <span>{q.pid}</span>
      <span>{q.user}</span>
      <span style={{ color: T.teal }}>{q.db}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{q.query}</span>
      <span style={{ color: durColor, fontWeight: 600 }}>{q.duration}</span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 600,
        background: `${T.green}18`, border: `1px solid ${T.green}30`, color: T.green,
      }}>{q.state}</span>
    </div>
  );
}

function ActiveQueriesTable({ activeConnection }) {
  const [queries, setQueries] = useState([]);

  useEffect(() => {
    if (!activeConnection) { setQueries([]); return; }
    let cancelled = false;
    const fetchQueries = async () => {
      try {
        const result = await window.akatsuki.kawaiidb.getActiveQueries({ connectionId: activeConnection.id });
        if (!cancelled && result.queries) setQueries(result.queries);
      } catch {}
    };
    fetchQueries();
    const interval = setInterval(fetchQueries, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeConnection?.id]);

  const headers = ["PID", "USER", "DATABASE", "QUERY", "DURATION", "STATE"];
  const colWidths = ["60px", "90px", "90px", "1fr", "80px", "90px"];

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
            background: queries.length > 0 ? `${T.green}18` : `${T.txt3}18`,
            border: `1px solid ${queries.length > 0 ? T.green : T.txt3}40`,
            color: queries.length > 0 ? T.green : T.txt3,
            fontFamily: T.fontUI,
          }}
        >
          {queries.length} running
        </span>
      </PanelHeader>

      <div style={{ flex: 1, overflow: "auto" }}>
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
            <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.txt3, fontFamily: T.fontUI, textTransform: "uppercase" }}>{h}</span>
          ))}
        </div>

        {queries.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", gap: 8 }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
              <circle cx={12} cy={12} r={10} stroke={T.txt3} strokeWidth={1.5} strokeDasharray="3 3" />
              <path d="M8 12h8M12 8v8" stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
            </svg>
            <span style={{ fontSize: 13, color: T.txt2, fontFamily: T.fontUI, fontWeight: 500 }}>No active queries</span>
            <span style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>Active queries will appear here in real time</span>
          </div>
        ) : (
          queries.map((q, i) => <ActiveQueryRow key={q.pid || i} q={q} />)
        )}
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

function ServerInfoPanel({ activeConnection, realServerInfo }) {
  const serverInfo = useMemo(() => {
    if (realServerInfo && realServerInfo.serverInfo) return realServerInfo.serverInfo;
    if (!activeConnection) return [];

    const dbInfo = DB_TYPES[activeConnection.type];
    const dbLabel = dbInfo ? dbInfo.label : activeConnection.type;
    const version = activeConnection.version || dbLabel;

    return [
      { label: "Server", value: version },
      { label: "Connection", value: activeConnection.name },
      { label: "Database", value: activeConnection.database || "--" },
      { label: "Host", value: activeConnection.host || "--" },
      { label: "Uptime", value: "Loading..." },
    ];
  }, [activeConnection, realServerInfo]);

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

  // Fetch real server metrics via IPC
  const [realServerInfo, setRealServerInfo] = useState(null);

  // Fetch real query stats (for donut chart)
  const [queryStats, setQueryStats] = useState(null);

  useEffect(() => {
    if (!activeConnection) { setRealServerInfo(null); setQueryStats(null); return; }
    let cancelled = false;
    const fetchInfo = async () => {
      try {
        const info = await window.akatsuki.kawaiidb.getServerInfo({ connectionId: activeConnection.id });
        if (!cancelled && info && !info.error) setRealServerInfo(info);
      } catch {}
    };
    const fetchStats = async () => {
      try {
        const result = await window.akatsuki.kawaiidb.getQueryStats({ connectionId: activeConnection.id });
        if (!cancelled && result && result.stats) setQueryStats(result.stats);
      } catch {}
    };
    fetchInfo();
    fetchStats();
    const interval = setInterval(fetchInfo, 10000); // Poll every 10s
    const statsInterval = setInterval(fetchStats, 15000); // Poll every 15s
    return () => { cancelled = true; clearInterval(interval); clearInterval(statsInterval); };
  }, [activeConnection?.id]);

  // Derive metrics from real data or fallback to seeded random
  const metrics = useMemo(() => {
    if (realServerInfo && realServerInfo.metrics) {
      const m = realServerInfo.metrics;
      const diskPct = m.diskTotal > 0 ? Math.round((m.diskUsed / m.diskTotal) * 100) : 0;
      return {
        queriesPerSec: (m.queriesPerSec || 0).toLocaleString(),
        avgQueryTime: `${m.avgQueryTime || 0}ms`,
        p95: realServerInfo.uptime ? `uptime: ${realServerInfo.uptime}` : "",
        diskUsed: m.diskUsed || 0,
        diskTotal: m.diskTotal || 100,
        diskPct,
      };
    }
    // Fallback: seeded random (when no real data yet)
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
      diskUsed, diskTotal, diskPct,
    };
  }, [connectionCount, realServerInfo]);

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
        <QueryPerformanceChart realMetrics={realServerInfo?.metrics} />
        <QueriesByTypeChart queryStats={queryStats} />
      </div>

      {/* ── Charts Row 2 ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <ActiveQueriesTable activeConnection={activeConnection} />
        <ServerInfoPanel activeConnection={activeConnection} realServerInfo={realServerInfo} />
      </div>
    </div>
  );
}

export default ScreenDashboard;

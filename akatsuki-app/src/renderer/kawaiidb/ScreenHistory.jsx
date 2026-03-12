import React, { useState, useMemo, useEffect, useCallback } from "react";
import { T } from "../tokens";
import { PanelHeader, Btn } from "../components";
import { useKawaii } from "./KawaiiApp";

// ── localStorage key ────────────────────────────────────────────────────────
const LS_KEY = "kawaiidb:analysis-history";
const PAGE_SIZE = 8;

// ── localStorage read/write helpers ─────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveHistory(entries) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {}
}

/**
 * Add an analysis entry to history. Call this from ScreenAIAnalyze or anywhere.
 *
 * Expected entry shape:
 * {
 *   title: string,
 *   sql: string,
 *   aiSummary: string,
 *   connectionId: string,
 *   connectionName: string,
 *   connectionColor: string,
 *   dbType: string,
 *   database: string,
 *   score: number (0-100),
 *   issues: { critical: number, warning: number, info: number },
 *   improvement: number (percentage),
 *   timeBefore: string,
 *   timeAfter: string,
 * }
 */
export function addAnalysisToHistory(entry) {
  const history = loadHistory();
  const now = new Date();
  const newEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "optimized",
    date: formatDate(now),
    time: formatTime(now),
    timestamp: now.toISOString(),
    ...entry,
  };
  // Prepend newest first
  history.unshift(newEntry);
  saveHistory(history);
  return newEntry;
}

// ── Date/time formatting helpers ────────────────────────────────────────────
function formatDate(d) {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const oneDay = 86400000;
  if (diff < oneDay && now.getDate() === d.getDate()) return "Today";
  if (diff < 2 * oneDay && now.getDate() - d.getDate() === 1) return "Yesterday";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(d) {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ── Status config ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  applied:   { label: "Applied",   color: T.green,  bg: `${T.green}18`, border: `${T.green}30` },
  optimized: { label: "Optimized", color: T.blue,   bg: `${T.blue}18`,  border: `${T.blue}30` },
  indexed:   { label: "Indexed",   color: T.teal,   bg: `${T.teal}18`,  border: `${T.teal}30` },
  dismissed: { label: "Dismissed", color: T.txt3,   bg: T.bg3,          border: T.border2 },
};

const FILTER_PILLS = [
  { id: "all",       label: "All" },
  { id: "optimized", label: "Optimized" },
  { id: "applied",   label: "Applied" },
  { id: "indexed",   label: "Indexed" },
  { id: "dismissed", label: "Dismissed" },
];

// ── Score color helper ──────────────────────────────────────────────────────
function scoreColor(score) {
  if (score <= 40) return T.red;
  if (score <= 60) return T.amber;
  return T.green;
}

// ── Summary card ────────────────────────────────────────────────────────────
function SummaryCard({ label, value, subtext, accent, subtextColor }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 200,
        height: 56,
        background: T.bg1,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: "2px 0 0 2px",
          background: accent,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: T.txt3,
            fontFamily: T.fontUI,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: accent,
              fontFamily: T.fontMono,
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontSize: 10,
              color: subtextColor || T.txt3,
              fontFamily: T.fontUI,
            }}
          >
            {subtext}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Mini score gauge (SVG circle) ───────────────────────────────────────────
function MiniGauge({ score }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <svg width={32} height={32} viewBox="0 0 32 32">
      <circle
        cx={16}
        cy={16}
        r={r}
        fill="none"
        stroke={T.bg3}
        strokeWidth={3}
      />
      <circle
        cx={16}
        cy={16}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference * 0.25}
        transform="rotate(-90 16 16)"
      />
      <text
        x={16}
        y={20}
        fill={color}
        fontSize={9}
        fontWeight={700}
        textAnchor="middle"
        fontFamily={T.fontMono}
      >
        {score}
      </text>
    </svg>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.dismissed;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 10px",
        borderRadius: 9,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        fontSize: 9,
        fontWeight: 600,
        color: cfg.color,
        fontFamily: T.fontUI,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Issue count badges ──────────────────────────────────────────────────────
function IssueBadges({ issues }) {
  if (!issues) return null;
  const badges = [];
  if (issues.critical > 0)
    badges.push({ count: issues.critical, color: T.red });
  if (issues.warning > 0)
    badges.push({ count: issues.warning, color: T.amber });
  if (issues.info > 0)
    badges.push({ count: issues.info, color: T.blue });

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {badges.map((b, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 16,
            borderRadius: 3,
            background: `${b.color}18`,
            fontSize: 9,
            fontWeight: 700,
            color: b.color,
            fontFamily: T.fontMono,
          }}
        >
          {b.count}
        </span>
      ))}
    </div>
  );
}

// ── Filter pill ─────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 12px",
        height: 22,
        borderRadius: 9,
        background: active ? `${T.purple}18` : "transparent",
        border: `1px solid ${active ? `${T.purple}40` : T.border2}`,
        fontSize: 10,
        fontWeight: active ? 600 : 400,
        color: active ? T.purple : T.txt3,
        fontFamily: T.fontUI,
        cursor: "pointer",
        outline: "none",
        transition: "all 0.12s",
        opacity: hov && !active ? 0.8 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ── History row ─────────────────────────────────────────────────────────────
function HistoryRow({ entry, index, onOpen, onApply, onDismiss, onRerun }) {
  const [hov, setHov] = useState(false);
  const isDismissed = entry.status === "dismissed";
  const showApply = entry.status === "optimized";
  const bgEven = T.bg0;
  const bgOdd = T.bg1;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 64,
        padding: "8px 0",
        background: hov
          ? `${T.purple}06`
          : index % 2 === 0
          ? bgEven
          : bgOdd,
        borderLeft: hov ? `3px solid ${T.purple}` : "3px solid transparent",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onClick={() => onOpen(entry)}
    >
      {/* STATUS */}
      <div style={{ width: 90, minWidth: 90, paddingLeft: 16 }}>
        <StatusBadge status={entry.status} />
      </div>

      {/* SCORE */}
      <div
        style={{
          width: 50,
          minWidth: 50,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <MiniGauge score={entry.score || 0} />
      </div>

      {/* QUERY PREVIEW */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isDismissed ? T.txt3 : T.txt,
            fontFamily: T.fontUI,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: T.txt3,
            fontFamily: T.fontMono,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 2,
          }}
        >
          {entry.sql}
        </div>
        <div
          style={{
            fontSize: 9,
            color: entry.status === "indexed" ? T.teal : isDismissed ? T.txt3 : T.purple,
            fontFamily: T.fontUI,
          }}
        >
          {"\u2726"} {entry.aiSummary}
        </div>
      </div>

      {/* CONNECTION */}
      <div style={{ width: 120, minWidth: 120 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: entry.connectionColor || T.txt3,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: isDismissed ? T.txt3 : T.txt,
              fontFamily: T.fontMono,
            }}
          >
            {entry.connectionName || "—"}
          </span>
        </div>
        <div
          style={{
            fontSize: 9,
            color: T.txt3,
            fontFamily: T.fontUI,
            paddingLeft: 14,
          }}
        >
          {entry.dbType || ""}
        </div>
      </div>

      {/* DATABASE */}
      <div style={{ width: 110, minWidth: 110 }}>
        <span
          style={{
            fontSize: 10,
            color: isDismissed ? T.txt3 : T.txt,
            fontFamily: T.fontMono,
          }}
        >
          {entry.database || "—"}
        </span>
      </div>

      {/* ISSUES */}
      <div style={{ width: 80, minWidth: 80 }}>
        <IssueBadges issues={entry.issues} />
      </div>

      {/* IMPROVEMENT */}
      <div style={{ width: 90, minWidth: 90 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: isDismissed ? T.txt3 : T.green,
            fontFamily: T.fontMono,
          }}
        >
          {entry.improvement != null ? `${entry.improvement}%` : "—"}
        </div>
        {entry.timeBefore && entry.timeAfter && (
          <div
            style={{
              fontSize: 9,
              color: isDismissed ? T.txt3 : T.green,
              fontFamily: T.fontUI,
            }}
          >
            {entry.timeBefore} {"\u2192"} {entry.timeAfter}
          </div>
        )}
      </div>

      {/* DATE */}
      <div style={{ width: 70, minWidth: 70 }}>
        <div
          style={{
            fontSize: 10,
            color: T.txt,
            fontFamily: T.fontUI,
          }}
        >
          {entry.date}
        </div>
        <div
          style={{
            fontSize: 9,
            color: T.txt3,
            fontFamily: T.fontMono,
          }}
        >
          {entry.time}
        </div>
      </div>

      {/* ACTIONS */}
      <div
        style={{
          width: 100,
          minWidth: 100,
          display: "flex",
          gap: 6,
          paddingRight: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onOpen(entry)}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            background: `${T.purple}14`,
            border: `1px solid ${T.purple}40`,
            color: T.purple,
            fontSize: 9,
            fontWeight: 600,
            fontFamily: T.fontUI,
            cursor: "pointer",
            outline: "none",
          }}
        >
          Open
        </button>
        {showApply ? (
          <button
            onClick={() => onApply(entry.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: `${T.green}14`,
              border: `1px solid ${T.green}30`,
              color: T.green,
              fontSize: 9,
              fontFamily: T.fontUI,
              cursor: "pointer",
              outline: "none",
            }}
          >
            Apply
          </button>
        ) : (
          <button
            onClick={() => onRerun(entry)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              color: T.txt3,
              fontSize: 9,
              fontFamily: T.fontUI,
              cursor: "pointer",
              outline: "none",
            }}
          >
            Rerun
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────
function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }) {
  if (totalPages <= 0) return null;

  const pages = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    // Always show first page
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    // Always show last page
    if (totalPages > 1) pages.push(totalPages);
  }

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      style={{
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid ${T.border}`,
        padding: "0 20px",
        background: T.bg1,
        fontFamily: T.fontUI,
        fontSize: 10,
      }}
    >
      <span style={{ color: T.txt3 }}>
        Showing {from}-{to} of {totalItems} analyses
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => typeof p === "number" && onPageChange(p)}
            style={{
              width: 24,
              height: 18,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: p === currentPage ? T.purple : T.bg3,
              border: "none",
              color: p === currentPage ? T.bg0 : T.txt3,
              fontSize: 10,
              fontWeight: p === currentPage ? 600 : 400,
              cursor: typeof p === "number" ? "pointer" : "default",
              fontFamily: T.fontUI,
              outline: "none",
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ onGoToAnalyze }) {
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
      {/* Icon */}
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={27} fill="none" stroke={T.border2} strokeWidth={2} />
        <text x={28} y={34} textAnchor="middle" fontSize={24} fill={T.txt3}>
          {"\u2726"}
        </text>
      </svg>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: T.txt,
          fontFamily: T.fontUI,
          textAlign: "center",
        }}
      >
        No analyses yet
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.txt3,
          fontFamily: T.fontUI,
          textAlign: "center",
          maxWidth: 340,
          lineHeight: 1.5,
        }}
      >
        Run your first AI analysis in the AI Analyze tab to see results here.
        Each analysis will be tracked with its score, issues found, and improvement metrics.
      </div>
      <Btn
        onClick={onGoToAnalyze}
        style={{
          marginTop: 8,
          height: 32,
          fontSize: 12,
          padding: "0 20px",
          background: T.purple,
          color: T.bg0,
          border: "none",
          fontWeight: 700,
          borderRadius: 6,
        }}
      >
        {"\u2726"} Go to AI Analyze
      </Btn>
    </div>
  );
}

// ── CSV export helper ───────────────────────────────────────────────────────
function exportCSV(entries) {
  const headers = [
    "ID", "Status", "Score", "Title", "SQL", "AI Summary",
    "Connection", "DB Type", "Database", "Issues Critical",
    "Issues Warning", "Issues Info", "Improvement %",
    "Time Before", "Time After", "Date", "Time", "Timestamp",
  ];

  const escapeCSV = (val) => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((e) => [
    e.id,
    e.status,
    e.score,
    e.title,
    e.sql,
    e.aiSummary,
    e.connectionName,
    e.dbType,
    e.database,
    e.issues?.critical ?? 0,
    e.issues?.warning ?? 0,
    e.issues?.info ?? 0,
    e.improvement,
    e.timeBefore,
    e.timeAfter,
    e.date,
    e.time,
    e.timestamp,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kawaiidb-analysis-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Compute summary from real data ──────────────────────────────────────────
function computeSummary(entries) {
  const total = entries.length;
  const applied = entries.filter((e) => e.status === "applied").length;
  const indexed = entries.filter((e) => e.status === "indexed").length;

  // Count entries from last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const thisWeek = entries.filter((e) => {
    if (!e.timestamp) return false;
    return new Date(e.timestamp) >= weekAgo;
  }).length;

  // Average improvement across all entries that have one
  const withImprovement = entries.filter((e) => e.improvement != null && e.improvement > 0);
  const avgImprovement = withImprovement.length > 0
    ? Math.round(withImprovement.reduce((sum, e) => sum + e.improvement, 0) / withImprovement.length)
    : 0;

  // Apply rate
  const applyRate = total > 0 ? `${Math.round((applied / total) * 100)}%` : "0%";

  // Count unique databases for indexed entries
  const indexedDbs = new Set(entries.filter((e) => e.status === "indexed").map((e) => e.database));

  return {
    totalAnalyses: total,
    totalThisWeek: thisWeek,
    optimizationsApplied: applied,
    applyRate,
    indexesCreated: indexed,
    indexTables: indexedDbs.size,
    avgImprovement: avgImprovement > 0 ? `${avgImprovement}%` : "—",
  };
}

// ── Main Screen ─────────────────────────────────────────────────────────────
function ScreenHistory() {
  const { setActiveTab } = useKawaii();
  const [history, setHistory] = useState(loadHistory);
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Reload from localStorage when tab gains focus or storage changes
  useEffect(() => {
    const reload = () => setHistory(loadHistory());

    // Listen for storage events (other tabs / same-page writes)
    window.addEventListener("storage", reload);

    // Also poll on focus in case writes happen in the same window context
    window.addEventListener("focus", reload);

    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
    };
  }, []);

  // Filter + search
  const filteredEntries = useMemo(() => {
    let entries = history;
    if (filter !== "all") {
      entries = entries.filter((e) => e.status === filter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      entries = entries.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q) ||
          (e.sql || "").toLowerCase().includes(q) ||
          (e.connectionName || "").toLowerCase().includes(q) ||
          (e.database || "").toLowerCase().includes(q)
      );
    }
    return entries;
  }, [history, filter, searchText]);

  // Pagination
  const totalItems = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedEntries = filteredEntries.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const remaining = totalItems - safePage * PAGE_SIZE;

  // Reset page when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchText]);

  // Summary computed from real data
  const summary = useMemo(() => computeSummary(history), [history]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleOpen = useCallback(
    (entry) => {
      setActiveTab("ai-analyze");
    },
    [setActiveTab]
  );

  const handleRerun = useCallback(
    (entry) => {
      setActiveTab("ai-analyze");
    },
    [setActiveTab]
  );

  const handleApply = useCallback(
    (entryId) => {
      const updated = history.map((e) =>
        e.id === entryId ? { ...e, status: "applied" } : e
      );
      setHistory(updated);
      saveHistory(updated);
    },
    [history]
  );

  const handleDismiss = useCallback(
    (entryId) => {
      const updated = history.map((e) =>
        e.id === entryId ? { ...e, status: "dismissed" } : e
      );
      setHistory(updated);
      saveHistory(updated);
    },
    [history]
  );

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
    setCurrentPage(1);
  }, []);

  const handleExportCSV = useCallback(() => {
    exportCSV(filteredEntries);
  }, [filteredEntries]);

  // Table header columns
  const COLUMNS = [
    { label: "STATUS", width: 90 },
    { label: "SCORE", width: 50 },
    { label: "QUERY PREVIEW", flex: true },
    { label: "CONNECTION", width: 120 },
    { label: "DATABASE", width: 110 },
    { label: "ISSUES", width: 80 },
    { label: "IMPROVEMENT", width: 90 },
    { label: "DATE", width: 70 },
    { label: "ACTIONS", width: 100 },
  ];

  // ── Empty state ─────────────────────────────────────────────────────────
  if (history.length === 0) {
    return (
      <div
        className="screen-enter"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: T.bg0,
        }}
      >
        {/* Toolbar (minimal) */}
        <div
          style={{
            minHeight: 52,
            display: "flex",
            alignItems: "center",
            background: T.bg1,
            borderBottom: `1px solid ${T.border}`,
            padding: "0 16px",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: T.purple,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: T.txt,
                fontFamily: T.fontUI,
              }}
            >
              Analysis History
            </span>
            <span
              style={{
                fontSize: 10,
                color: T.txt3,
                fontFamily: T.fontUI,
              }}
            >
              Track your AI query analyses
            </span>
          </div>
        </div>

        <EmptyState onGoToAnalyze={() => setActiveTab("ai-analyze")} />
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
        background: T.bg0,
      }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div
        style={{
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
          padding: "0 16px",
          gap: 16,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: T.purple,
          }}
        />

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: T.txt,
              fontFamily: T.fontUI,
            }}
          >
            Analysis History
          </span>
          <span
            style={{
              fontSize: 10,
              color: T.txt3,
              fontFamily: T.fontUI,
            }}
          >
            Click any row to reopen in AI Analyze
          </span>
        </div>

        {/* Search */}
        <div style={{ marginLeft: 20 }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search history..."
            style={{
              width: 220,
              height: 28,
              borderRadius: 5,
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              padding: "0 12px",
              fontSize: 11,
              color: T.txt,
              fontFamily: T.fontUI,
              outline: "none",
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {FILTER_PILLS.map((pill) => (
            <FilterPill
              key={pill.id}
              label={pill.label}
              active={filter === pill.id}
              onClick={() => setFilter(pill.id)}
            />
          ))}
        </div>

        {/* Right side buttons */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
          }}
        >
          <Btn
            variant="ghost"
            onClick={handleExportCSV}
            style={{ height: 28, fontSize: 10, padding: "0 12px" }}
          >
            Export CSV
          </Btn>
          <Btn
            variant="danger"
            onClick={handleClearHistory}
            style={{ height: 28, fontSize: 10, padding: "0 12px" }}
          >
            Clear History
          </Btn>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 20px",
          overflow: "hidden",
        }}
      >
        <SummaryCard
          label="Total Analyses"
          value={summary.totalAnalyses}
          subtext={`\u2191 ${summary.totalThisWeek} this week`}
          accent={T.purple}
          subtextColor={T.green}
        />
        <SummaryCard
          label="Optimizations Applied"
          value={summary.optimizationsApplied}
          subtext={`${summary.applyRate} apply rate`}
          accent={T.green}
        />
        <SummaryCard
          label="Indexes Created"
          value={summary.indexesCreated}
          subtext={`across ${summary.indexTables} tables`}
          accent={T.teal}
        />
        <SummaryCard
          label="Avg Improvement"
          value={summary.avgImprovement}
          subtext="faster avg execution"
          accent={T.blue}
          subtextColor={T.green}
        />
      </div>

      {/* ── Table header ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          margin: "0 20px",
          background: T.bg2,
          borderRadius: "6px 6px 0 0",
          padding: "0 0",
        }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.label}
            style={{
              width: col.flex ? undefined : col.width,
              minWidth: col.flex ? undefined : col.width,
              flex: col.flex ? 1 : undefined,
              paddingLeft: col.label === "STATUS" ? 16 : 0,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.5,
              color: T.txt3,
              fontFamily: T.fontUI,
              textTransform: "uppercase",
            }}
          >
            {col.label}
          </div>
        ))}
      </div>
      <div
        style={{
          margin: "0 20px",
          height: 1,
          background: T.border,
        }}
      />

      {/* ── Table rows ───────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          margin: "0 20px",
        }}
      >
        {pagedEntries.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 120,
              color: T.txt3,
              fontSize: 12,
              fontFamily: T.fontUI,
            }}
          >
            No matching analyses found
          </div>
        )}

        {pagedEntries.map((entry, idx) => (
          <HistoryRow
            key={entry.id}
            entry={entry}
            index={idx}
            onOpen={handleOpen}
            onApply={handleApply}
            onDismiss={handleDismiss}
            onRerun={handleRerun}
          />
        ))}

        {/* Faded "more" indicator */}
        {remaining > 0 && (
          <div
            style={{
              height: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: T.txt3,
              fontSize: 11,
              fontFamily: T.fontUI,
              opacity: 0.5,
            }}
          >
            + {remaining} more analyses
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────── */}
      {totalItems > 0 && (
        <div style={{ margin: "0 20px" }}>
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}

export default ScreenHistory;

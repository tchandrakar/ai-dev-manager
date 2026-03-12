import { useState } from "react";
import { T, severityColor } from "./tokens";

// ── Btn ───────────────────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary: { bg: T.blue,           hoverBg: "#3a8de8", color: "#fff",   border: "none" },
  success: { bg: "transparent",    hoverBg: `${T.green}14`, color: T.green,  border: `1px solid ${T.green}40` },
  danger:  { bg: `${T.red}14`,     hoverBg: `${T.red}28`, color: T.red,   border: `1px solid ${T.red}40` },
  ghost:   { bg: T.bg3,            hoverBg: T.bg4,     color: T.txt,   border: `1px solid ${T.border2}` },
  subtle:  { bg: "transparent",    hoverBg: T.bg3,     color: T.txt2,  border: `1px solid ${T.border}` },
};

export function Btn({ variant = "primary", onClick, disabled, children, style, title }) {
  const [hov, setHov] = useState(false);
  const v = BTN_VARIANTS[variant] ?? BTN_VARIANTS.primary;

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "0 14px", height: 30, borderRadius: 6,
        fontSize: 12, fontWeight: 600, fontFamily: T.fontUI,
        cursor: disabled ? "not-allowed" : "pointer",
        border: v.border ?? "none", outline: "none",
        transition: "background 0.15s ease, opacity 0.15s ease, transform 0.1s ease",
        opacity: disabled ? 0.4 : 1,
        whiteSpace: "nowrap",
        background: hov && !disabled ? v.hoverBg : v.bg,
        color: v.color,
        transform: hov && !disabled ? "translateY(-1px)" : "translateY(0)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ severity, children, style }) {
  const color = severity ? severityColor(severity) : T.txt2;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 9, fontSize: 10, fontWeight: 600,
      background: `${color}18`, border: `1px solid ${color}40`, color,
      fontFamily: T.fontUI, ...style,
    }}>
      {children}
    </span>
  );
}

// ── PanelHeader ───────────────────────────────────────────────────────────────
export function PanelHeader({ title, accent = T.purple, count, children, style }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 12px", height: 36, borderBottom: `1px solid ${T.border}`,
      background: T.bg1, flexShrink: 0, ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 3, height: 18, background: accent, borderRadius: 2 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase" }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 10, color: T.txt2, background: T.bg3, padding: "1px 6px", borderRadius: 9, fontFamily: T.fontUI }}>
            {count}
          </span>
        )}
      </div>
      {children && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>}
    </div>
  );
}

// ── Dot ───────────────────────────────────────────────────────────────────────
export function Dot({ color = T.green, size = 8 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 6,
        color: T.txt, fontSize: 12, fontFamily: T.fontUI, padding: "6px 10px",
        outline: "none", width: "100%", ...style,
      }}
    />
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: "pointer", flexShrink: 0,
        background: checked ? T.green : T.bg4, position: "relative", transition: "background 0.2s",
        border: `1px solid ${checked ? T.green : T.border2}`,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: checked ? 17 : 2, width: 14, height: 14,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
      }} />
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, color = T.blue }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid ${color}30`,
      borderTop: `2px solid ${color}`, borderRadius: "50%",
      animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────
export function StatusPill({ status }) {
  const map = {
    open: { color: T.green, label: "Open" },
    closed: { color: T.red, label: "Closed" },
    merged: { color: T.purple, label: "Merged" },
  };
  const { color, label } = map[status] ?? map.open;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 9, fontSize: 10, fontWeight: 600,
      background: `${color}18`, border: `1px solid ${color}40`, color,
      fontFamily: T.fontUI,
    }}>
      <Dot color={color} size={6} /> {label}
    </span>
  );
}

// ── GlobalStyles ──────────────────────────────────────────────────────────────
export function GlobalStyles() {
  return (
    <style>{`
      @keyframes spin    { to { transform: rotate(360deg); } }
      @keyframes fadeIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
      @keyframes pulse   { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes pop     { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

      * { box-sizing: border-box; }

      /* Screen-level entrance */
      .screen-enter { animation: fadeIn 0.2s ease-out; }

      /* Scrollbar */
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.txt3}; }

      input::placeholder  { color: ${T.txt3}; }
      textarea::placeholder { color: ${T.txt3}; }
      textarea {
        background: ${T.bg3}; border: 1px solid ${T.border2}; border-radius: 6px;
        color: ${T.txt}; font-family: ${T.fontUI}; font-size: 12px;
        padding: 8px 10px; outline: none; resize: vertical;
        transition: border-color 0.15s ease;
      }
      textarea:focus { border-color: ${T.blue}60; }
      input:focus { outline: none; }

      /* Nav item hover (used via inline style transitions, this supplements) */
      [data-nav-item]:hover { background: ${T.bg3}40 !important; }
    `}</style>
  );
}

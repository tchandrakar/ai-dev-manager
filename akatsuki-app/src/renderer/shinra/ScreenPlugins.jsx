import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Input, Toggle } from "../components";
import { useShinra } from "./ShinraApp";

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["All", "Language", "Tools", "AI", "Themes"];

const FEATURES_BY_CATEGORY = {
  Language: ["IntelliSense", "Diagnostics", "Formatting", "Syntax Highlighting", "Code Navigation"],
  Tools: ["Integration", "Automation", "Configuration", "Task Running"],
  AI: ["Code Suggestions", "Chat", "Analysis", "Refactoring"],
  Themes: ["Color Scheme", "Icon Pack", "Font Configuration"],
};

const SETTINGS_BY_CATEGORY = {
  Language: [
    { key: "autoFormat", label: "Auto-format on save", default: true },
    { key: "inlineHints", label: "Show inline hints", default: true },
    { key: "diagnostics", label: "Real-time diagnostics", default: true },
    { key: "autoImport", label: "Auto-import suggestions", default: false },
  ],
  Tools: [
    { key: "autoRun", label: "Auto-run on file change", default: false },
    { key: "notifications", label: "Show notifications", default: true },
    { key: "statusBar", label: "Show in status bar", default: true },
  ],
  AI: [
    { key: "inlineSuggestions", label: "Inline suggestions", default: true },
    { key: "autoComplete", label: "AI auto-complete", default: true },
    { key: "codeExplanations", label: "Code explanations on hover", default: false },
    { key: "telemetry", label: "Send usage telemetry", default: false },
  ],
  Themes: [
    { key: "applyIcons", label: "Apply file icons", default: true },
    { key: "applyColors", label: "Apply color scheme", default: true },
  ],
};

// ── StarRating ───────────────────────────────────────────────────────────────
function StarRating({ rating, size = 12 }) {
  const full = Math.floor(rating);
  const partial = rating - full;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    let fill;
    if (i < full) fill = 1;
    else if (i === full) fill = partial;
    else fill = 0;
    stars.push(
      <span key={i} style={{ position: "relative", display: "inline-block", width: size, height: size, fontSize: size, lineHeight: 1 }}>
        <span style={{ color: T.txt3 }}>{"\u2605"}</span>
        <span
          style={{
            position: "absolute", top: 0, left: 0,
            width: `${fill * 100}%`, overflow: "hidden",
            color: T.amber,
          }}
        >
          {"\u2605"}
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      {stars}
      <span style={{ fontSize: 10, color: T.txt2, marginLeft: 4, fontFamily: T.fontUI }}>{rating.toFixed(1)}</span>
    </span>
  );
}

// ── CategoryTab ──────────────────────────────────────────────────────────────
function CategoryTab({ label, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        fontFamily: T.fontUI,
        color: active ? "#fff" : T.txt2,
        background: active ? T.blue : hov ? T.bg3 : "transparent",
        border: active ? "none" : `1px solid ${hov ? T.border2 : "transparent"}`,
        cursor: "pointer",
        outline: "none",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

// ── FeatureItem ──────────────────────────────────────────────────────────────
function FeatureItem({ label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color || T.blue, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: T.txt, fontFamily: T.fontUI }}>{label}</span>
    </div>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────────
function SettingRow({ label, checked, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 12, color: T.txt, fontFamily: T.fontUI }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── PluginCard ────────────────────────────────────────────────────────────────
function PluginCard({ plugin, selected, onSelect, onToggleInstall, onToggleEnable }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? T.bg3 : hov ? T.bg2 : T.bg1,
        border: `1px solid ${selected ? T.blue + "60" : T.border}`,
        borderLeft: `3px solid ${plugin.color}`,
        borderRadius: 8,
        padding: 14,
        cursor: "pointer",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: `${plugin.color}18`,
          border: `1px solid ${plugin.color}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700, color: plugin.color,
          fontFamily: T.fontMono, flexShrink: 0,
        }}>
          {plugin.abbr}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.txt, fontFamily: T.fontUI }}>{plugin.name}</span>
            <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>v{plugin.version}</span>
          </div>
          <div style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI, marginTop: 1 }}>
            by {plugin.author}
          </div>
        </div>
        {plugin.installed && (
          <Badge style={{ background: `${T.green}18`, border: `1px solid ${T.green}40`, color: T.green }}>
            Installed
          </Badge>
        )}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 11, color: T.txt2, fontFamily: T.fontUI, lineHeight: 1.5,
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {plugin.description}
      </div>

      {/* Footer: rating, downloads, actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StarRating rating={plugin.rating} />
          <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI }}>
            {"\u2B07"} {plugin.downloads}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          {plugin.installed && (
            <Toggle checked={plugin.enabled} onChange={() => onToggleEnable(plugin.id)} />
          )}
          <Btn
            variant={plugin.installed ? "danger" : "primary"}
            onClick={() => onToggleInstall(plugin.id)}
            style={{ height: 26, fontSize: 10, padding: "0 10px" }}
          >
            {plugin.installed ? "Uninstall" : "Install"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── PluginDetail ──────────────────────────────────────────────────────────────
function PluginDetail({ plugin, onToggleInstall, onToggleEnable, pluginSettings, onSettingChange }) {
  const features = FEATURES_BY_CATEGORY[plugin.category] || ["General Features"];
  const settingDefs = SETTINGS_BY_CATEGORY[plugin.category] || [];

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      overflow: "hidden",
    }}>
      <PanelHeader title="Plugin Details" accent={plugin.color} />

      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: `${plugin.color}18`,
            border: `1px solid ${plugin.color}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: plugin.color,
            fontFamily: T.fontMono, flexShrink: 0,
          }}>
            {plugin.abbr}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, fontFamily: T.fontUI }}>{plugin.name}</div>
            <div style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontMono, marginTop: 2 }}>
              v{plugin.version} by {plugin.author}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <Badge style={{ background: `${plugin.color}18`, border: `1px solid ${plugin.color}40`, color: plugin.color }}>
                {plugin.category}
              </Badge>
              <StarRating rating={plugin.rating} />
              <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI }}>{"\u2B07"} {plugin.downloads}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Description
          </div>
          <div style={{ fontSize: 12, color: T.txt2, fontFamily: T.fontUI, lineHeight: 1.6 }}>
            {plugin.description}
          </div>
        </div>

        {/* Features */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Features
          </div>
          {features.map(f => (
            <FeatureItem key={f} label={f} color={plugin.color} />
          ))}
        </div>

        {/* Settings (only if installed) */}
        {plugin.installed && settingDefs.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Settings
            </div>
            {settingDefs.map(s => (
              <SettingRow
                key={s.key}
                label={s.label}
                checked={pluginSettings[s.key] !== undefined ? pluginSettings[s.key] : s.default}
                onChange={(val) => onSettingChange(plugin.id, s.key, val)}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <Btn
            variant={plugin.installed ? "danger" : "primary"}
            onClick={() => onToggleInstall(plugin.id)}
            style={{ flex: 1 }}
          >
            {plugin.installed ? "Uninstall" : "Install"}
          </Btn>
          {plugin.installed && (
            <Btn
              variant={plugin.enabled ? "subtle" : "success"}
              onClick={() => onToggleEnable(plugin.id)}
              style={{ flex: 1 }}
            >
              {plugin.enabled ? "Disable" : "Enable"}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AddPluginForm ─────────────────────────────────────────────────────────────
function AddPluginForm({ onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Tools");
  const [version, setVersion] = useState("1.0.0");

  const CATEGORY_OPTIONS = ["Language", "Tools", "AI", "Themes"];
  const CATEGORY_COLORS = { Language: T.blue, Tools: T.teal, AI: T.purple, Themes: T.amber };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const abbr = name.trim().slice(0, 2).toUpperCase();
    onSubmit({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      abbr,
      version: version.trim() || "1.0.0",
      author: "Custom",
      color: CATEGORY_COLORS[category] || T.cyan,
      category,
      installed: true,
      enabled: true,
      rating: 0,
      downloads: "0",
      description: description.trim() || "Custom plugin",
    });
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bg1, border: `1px solid ${T.border2}`,
          borderRadius: 12, padding: 24, width: 400,
          display: "flex", flexDirection: "column", gap: 14,
          animation: "pop 0.2s ease-out",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txt, fontFamily: T.fontUI }}>
          Add Custom Plugin
        </div>

        <div>
          <label style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, display: "block", marginBottom: 4 }}>Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Plugin" />
        </div>

        <div>
          <label style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, display: "block", marginBottom: 4 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this plugin do?"
            rows={3}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, display: "block", marginBottom: 4 }}>Category</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORY_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    fontFamily: T.fontUI, cursor: "pointer", outline: "none",
                    border: `1px solid ${category === c ? CATEGORY_COLORS[c] + "80" : T.border}`,
                    background: category === c ? CATEGORY_COLORS[c] + "18" : "transparent",
                    color: category === c ? CATEGORY_COLORS[c] : T.txt2,
                    transition: "all 0.15s ease",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, display: "block", marginBottom: 4 }}>Version</label>
            <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={!name.trim()}>Add Plugin</Btn>
        </div>
      </div>
    </div>
  );
}

// ── ScreenPlugins (main) ─────────────────────────────────────────────────────
function ScreenPlugins() {
  const { plugins, setPlugins } = useShinra();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pluginSettings, setPluginSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("shinra:plugin-settings");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // Persist plugin-level settings
  const handleSettingChange = useCallback((pluginId, key, val) => {
    setPluginSettings(prev => {
      const next = { ...prev, [pluginId]: { ...(prev[pluginId] || {}), [key]: val } };
      try { localStorage.setItem("shinra:plugin-settings", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Filter plugins
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return plugins.filter(p => {
      const matchesCategory = activeCategory === "All" || p.category === activeCategory;
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [plugins, search, activeCategory]);

  const selectedPlugin = useMemo(() => {
    if (!selectedId) return null;
    return plugins.find(p => p.id === selectedId) || null;
  }, [plugins, selectedId]);

  // Escape closes detail panel / add form
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (showAddForm) setShowAddForm(false);
        else if (selectedId) setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, showAddForm]);

  // Actions
  const toggleInstall = useCallback((id) => {
    setPlugins(prev => prev.map(p => {
      if (p.id !== id) return p;
      const installed = !p.installed;
      return { ...p, installed, enabled: installed ? p.enabled : false };
    }));
  }, [setPlugins]);

  const toggleEnable = useCallback((id) => {
    setPlugins(prev => prev.map(p =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    ));
  }, [setPlugins]);

  const addCustomPlugin = useCallback((plugin) => {
    setPlugins(prev => [...prev, plugin]);
    setShowAddForm(false);
    setSelectedId(plugin.id);
  }, [setPlugins]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0,
      }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, color: T.txt3, pointerEvents: "none",
          }}>
            {"\uD83D\uDD0D"}
          </span>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plugins..."
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {CATEGORIES.map(cat => (
            <CategoryTab
              key={cat}
              label={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Btn variant="primary" onClick={() => setShowAddForm(true)} style={{ height: 30, fontSize: 11 }}>
            + Add Custom
          </Btn>
        </div>
      </div>

      {/* ── Body: grid + detail ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Plugin grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {filtered.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 12,
            }}>
              <span style={{ fontSize: 40, opacity: 0.3 }}>{"\uD83D\uDD0C"}</span>
              <span style={{ fontSize: 14, color: T.txt3, fontFamily: T.fontUI }}>
                No plugins found
              </span>
              <span style={{ fontSize: 12, color: T.txt3, fontFamily: T.fontUI }}>
                {search ? `No results for "${search}"` : `No plugins in "${activeCategory}" category`}
              </span>
              {search && (
                <Btn variant="ghost" onClick={() => { setSearch(""); setActiveCategory("All"); }} style={{ marginTop: 4 }}>
                  Clear filters
                </Btn>
              )}
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              alignContent: "start",
            }}>
              {filtered.map(p => (
                <PluginCard
                  key={p.id}
                  plugin={p}
                  selected={selectedId === p.id}
                  onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  onToggleInstall={toggleInstall}
                  onToggleEnable={toggleEnable}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedPlugin && (
          <div style={{
            width: 320, flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            background: T.bg1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "slideIn 0.15s ease-out",
          }}>
            <PluginDetail
              plugin={selectedPlugin}
              onToggleInstall={toggleInstall}
              onToggleEnable={toggleEnable}
              pluginSettings={pluginSettings[selectedPlugin.id] || {}}
              onSettingChange={handleSettingChange}
            />
          </div>
        )}
      </div>

      {/* Add plugin modal */}
      {showAddForm && (
        <AddPluginForm
          onSubmit={addCustomPlugin}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

export default ScreenPlugins;

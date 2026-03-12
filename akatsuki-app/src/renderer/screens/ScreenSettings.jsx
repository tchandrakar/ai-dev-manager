import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";
import { Btn, Dot, Toggle, Spinner } from "../components";
import { useApp, useWorkingDir, useAgents, useGitConnections } from "../store/AppContext";

// (Git platform cards live in ScreenConnectors — use the left nav ⎇ item to manage connections)

// ── Section header ────────────────────────────────────────────────────────────
function SH({ label, desc, accent, right }) {
  return (
    <div style={{
      height: 52, background: T.bg1, borderBottom: `1px solid ${T.border}`,
      borderLeft: `3px solid ${accent}`, padding: "0 24px 0 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txt }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: T.txt2, marginTop: 1 }}>{desc}</div>}
      </div>
      {right}
    </div>
  );
}

// ── AI Agent Card ─────────────────────────────────────────────────────────────
function AIAgentCard({ id, label, sublabel, icon, accentColor, models, agent, onSave }) {
  const [visible, setVisible] = useState(false);
  const [key, setKey]         = useState(agent.apiKey ?? "");
  const isActive = !!(agent.enabled && agent.apiKey);

  function save() { onSave(id, { ...agent, apiKey: key, enabled: !!key }); }

  const usageData = {
    anthropic: { text: "1.56M / 4M tokens", pct: 39 },
    openai:    { text: "$4.82 / $20.00",    pct: 24 },
  };
  const u = usageData[id];

  return (
    <div style={{
      flex: 1, background: T.bg1, borderRadius: 10, overflow: "hidden", position: "relative",
      border: `1px solid ${isActive ? `${accentColor}30` : T.border}`,
      ...(!agent.apiKey && { borderStyle: "dashed" }),
    }}>
      {/* left accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: 3, height: "100%",
        background: isActive ? accentColor : T.txt3,
      }}/>

      {/* header */}
      <div style={{
        height: 52, paddingLeft: 20, paddingRight: 16,
        background: isActive ? `${accentColor}0A` : T.bg2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `2px solid ${isActive ? `${accentColor}20` : T.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `${accentColor}18`, border: `1px solid ${accentColor}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: accentColor,
          }}>{icon}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: 11, color: isActive ? accentColor : T.txt2 }}>{sublabel}</div>
          </div>
        </div>
        {isActive
          ? <span style={{ fontSize:10,color:accentColor,background:`${accentColor}18`,border:`1px solid ${accentColor}40`,padding:"2px 8px",borderRadius:9,fontWeight:600 }}>● Active</span>
          : <span style={{ fontSize:10,color:T.txt2,background:T.bg3,border:`1px solid ${T.border}`,padding:"2px 8px",borderRadius:9 }}>Not Active</span>
        }
      </div>

      {/* body */}
      <div style={{ padding: "14px 20px" }}>
        <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>Model</div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <select value={agent.model ?? models[0]}
            onChange={e => onSave(id, { ...agent, model: e.target.value })}
            style={{
              width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 5,
              color: isActive ? T.txt : T.txt3, fontSize: 12, padding: "7px 28px 7px 12px",
              fontFamily: T.fontUI, outline: "none", cursor: "pointer", appearance: "none",
            }}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:T.txt2,pointerEvents:"none",fontSize:11 }}>▾</span>
        </div>

        <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>API Key</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type={visible ? "text" : "password"}
            value={key}
            onChange={e => setKey(e.target.value)}
            onBlur={save}
            placeholder={`Enter ${label} API key...`}
            style={{
              flex: 1, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 5,
              padding: "6px 12px", fontSize: 12, fontFamily: T.fontMono, color: T.txt3, outline: "none",
            }}
          />
          <Btn variant="subtle" onClick={() => setVisible(v => !v)}>👁</Btn>
        </div>

        <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>Usage this month</div>
        {isActive && u ? (
          <>
            <div style={{ height: 4, background: T.bg3, borderRadius: 2, marginBottom: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${u.pct}%`, background: accentColor, borderRadius: 2 }}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.txt3, marginBottom:12 }}>
              <span>{u.text}</span>
              <span style={{ color: accentColor }}>{u.pct}%</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10, color: T.txt3, marginBottom: 12 }}>Not configured</div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isActive ? (
            <>
              <Btn variant="subtle">Set Default</Btn>
              <Btn variant="ghost">Test Key</Btn>
              <span style={{ fontSize: 11, color: T.green }}>✓ Valid</span>
            </>
          ) : (
            <>
              <Btn variant="primary" onClick={save} disabled={!key}>Activate {label}</Btn>
              <span style={{ fontSize: 11, color: T.txt2 }}>Free tier available</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ScreenSettings() {
  const { state, dispatch } = useApp();
  const { workingDir, setWorkingDir } = useWorkingDir();
  const { agents, setAgent }          = useAgents();
  const { connections }               = useGitConnections();
  const prefs = state.preferences ?? {};
  const set = (k, v) => dispatch({ type: "SET_PREFERENCES", payload: { [k]: v } });

  const [activeNav, setActiveNav] = useState("ai");
  const [stats,     setStats]     = useState(null);
  const [changing,  setChanging]  = useState(false);
  const [confirming, setConfirming] = useState(null);

  const aiRef    = useRef(null);
  const prefRef  = useRef(null);
  const wdirRef  = useRef(null);

  useEffect(() => {
    if (workingDir) window.akatsuki.workdir.stats(workingDir).then(setStats).catch(() => {});
  }, [workingDir]);

  function scrollTo(id) {
    setActiveNav(id);
    const map = { ai: aiRef, preferences: prefRef, workdir: wdirRef };
    map[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleChangeDir() {
    setChanging(true);
    const r = await window.akatsuki.workdir.select();
    if (!r.canceled && r.path) {
      await window.akatsuki.workdir.init(r.path);
      const cfg = await window.akatsuki.config.load();
      await window.akatsuki.config.save({ ...cfg, workingDir: r.path });
      setWorkingDir(r.path);
    }
    setChanging(false);
  }

  async function clearAll() {
    if (workingDir) await window.akatsuki.workdir.clear(workingDir);
    setConfirming(null);
  }

  async function resetDir() {
    const cfg = await window.akatsuki.config.load();
    await window.akatsuki.config.save({ ...cfg, workingDir: null });
    setWorkingDir(null);
    dispatch({ type: "SET_SCREEN", payload: "setup" });
  }

  const fmtDate = iso => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    return diff < 60000 ? "Just now" : diff < 3600000 ? `${Math.floor(diff / 60000)}m ago` : new Date(iso).toLocaleDateString();
  };

  const aiProviders = [
    { id: "anthropic", label: "Anthropic Claude", sublabel: "claude.ai",       icon: "✦", accentColor: T.purple, models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"] },
    { id: "openai",    label: "OpenAI",            sublabel: "openai.com",      icon: "⬡", accentColor: T.green,  models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
    { id: "gemini",    label: "Google Gemini",     sublabel: "ai.google.dev",   icon: "◈", accentColor: T.blue,   models: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash"] },
  ];

  const activeGit = Object.values(connections ?? {}).filter(c => c?.connected).length;
  const activeAI  = Object.values(agents ?? {}).filter(a => a?.enabled && a?.apiKey).length;

  const navItems = [
    { id: "profile",       label: "Profile",            icon: "⊙" },
    { id: "ai",            label: "AI Agents",           icon: "✦", accent: T.purple, badge: `${activeAI}/${aiProviders.length}`, badgeColor: T.purple },
    { id: "notifications", label: "Notifications",       icon: "🔔" },
    { id: "security",      label: "Security & Access",   icon: "🔒" },
    { id: "billing",       label: "Usage & Billing",     icon: "📊" },
    { id: "workdir",       label: "Working Directory",   icon: "📁" },
  ];
  const scrollable = new Set(["ai", "preferences", "workdir"]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:T.bg0, fontFamily:T.fontUI }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 44, background: T.bg2, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", padding: "0 16px",
        flexShrink: 0, WebkitAppRegion: "drag",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.txt }}>Profile &amp; Integrations</span>
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Left Sidebar 240px ── */}
        <div style={{
          width: 240, background: T.bg2, borderRight: `1px solid ${T.border}`,
          flexShrink: 0, overflow: "hidden auto", display: "flex", flexDirection: "column",
        }}>
          {/* Profile */}
          <div style={{
            height: 100, display: "flex", alignItems: "center", padding: "0 16px",
            borderBottom: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: T.bg3, border: `2px solid ${T.border2}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, color: T.purple, flexShrink: 0,
            }}>T</div>
            <div style={{ marginLeft: 12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.txt, lineHeight:1.3 }}>Tanmay C.</div>
              <div style={{ fontSize:11, color:T.txt2, marginBottom:5 }}>tanmay@devai.io</div>
              <span style={{
                fontSize:9, fontWeight:600, color:T.purple,
                background:`${T.purple}18`, border:`1px solid ${T.purple}30`,
                padding:"1px 7px", borderRadius:7,
              }}>Pro Plan</span>
            </div>
          </div>

          {/* Nav */}
          <div style={{ padding: "8px 12px", flex: 1 }}>
            {navItems.map(({ id, label, icon, accent, badge, badgeColor }) => {
              const isActive = activeNav === id && scrollable.has(id);
              return (
                <div key={id}
                  onClick={() => scrollable.has(id) ? scrollTo(id) : undefined}
                  style={{
                    display:"flex", alignItems:"center", gap:10, height:32, borderRadius:6,
                    padding:"0 10px", cursor: scrollable.has(id) ? "pointer" : "default",
                    background: isActive ? T.bg3 : "transparent", marginBottom:2, position:"relative",
                  }}
                >
                  {isActive && (
                    <div style={{
                      position:"absolute", left:0, top:0, width:3, height:"100%",
                      background: accent, borderRadius:"2px 0 0 2px",
                    }}/>
                  )}
                  <span style={{ fontSize:13, color: isActive ? accent : T.txt3 }}>{icon}</span>
                  <span style={{ fontSize:12, color: isActive ? T.txt : T.txt2, fontWeight: isActive ? 600 : 400, flex:1 }}>
                    {label}
                  </span>
                  {badge && (
                    <span style={{
                      fontSize:9, fontWeight:600, color:badgeColor,
                      background:`${badgeColor}20`, border:`1px solid ${badgeColor}40`,
                      padding:"1px 6px", borderRadius:7,
                    }}>{badge}</span>
                  )}
                </div>
              );
            })}

            <div style={{ height:1, background:T.border, margin:"10px 0 6px" }}/>
            <div style={{ fontSize:10, color:T.txt3, letterSpacing:"0.08em", padding:"0 10px", marginBottom:4 }}>DANGER ZONE</div>
            <div style={{ display:"flex", alignItems:"center", gap:10, height:32, borderRadius:6, padding:"0 10px", cursor:"pointer" }}>
              <span style={{ fontSize:13, color:T.red }}>⚠</span>
              <span style={{ fontSize:12, color:T.red }}>Delete Account</span>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex:1, overflow:"hidden auto", background:T.bg0 }}>

          {/* Section 1: AI Agents */}
          <div ref={aiRef}>
            <SH label="AI Agents" accent={T.purple}
              desc="Configure AI models used for code review, suggestions, and chat"
              right={
                <span style={{
                  fontSize:11, color:T.purple, background:`${T.purple}14`,
                  border:`1px solid ${T.purple}30`, padding:"3px 10px", borderRadius:5,
                }}>✦ Active: Claude + GPT-4</span>
              }
            />
            <div style={{ display:"flex", gap:20, padding:"20px 24px 28px" }}>
              {aiProviders.map(p => (
                <AIAgentCard key={p.id} {...p}
                  agent={agents[p.id] ?? {}}
                  onSave={(id, cfg) => setAgent(id, cfg)}
                />
              ))}
            </div>
          </div>

          {/* Section 2: Review Preferences */}
          <div ref={prefRef}>
            <SH label="Review Preferences" accent={T.amber}
              desc="Control how AI agents behave during code review"
            />
            <div style={{ display:"flex", gap:20, padding:"20px 24px 28px" }}>
              {/* Primary agent */}
              <div style={{ flex:3, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:8, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:T.txt, marginBottom:3 }}>Primary Review Agent</div>
                  <div style={{ fontSize:11, color:T.txt2 }}>Used for inline suggestions and risk scoring</div>
                </div>
                <div style={{ position:"relative" }}>
                  <select value={prefs.primaryAgent ?? "anthropic"} onChange={e => set("primaryAgent", e.target.value)}
                    style={{ background:T.bg3, border:`1px solid ${T.border2}`, borderRadius:5, color:T.purple, fontSize:12, padding:"7px 28px 7px 12px", fontFamily:T.fontUI, outline:"none", cursor:"pointer", appearance:"none" }}>
                    <option value="anthropic">✦ Claude Sonnet</option>
                    <option value="openai">⬡ GPT-4o</option>
                    <option value="gemini">◈ Gemini</option>
                  </select>
                  <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:T.txt2, pointerEvents:"none", fontSize:11 }}>▾</span>
                </div>
              </div>

              {/* Fallback agent */}
              <div style={{ flex:3, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:8, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:T.txt, marginBottom:3 }}>Fallback Agent</div>
                  <div style={{ fontSize:11, color:T.txt2 }}>Used when primary agent is unavailable</div>
                </div>
                <div style={{ position:"relative" }}>
                  <select value={prefs.fallbackAgent ?? "openai"} onChange={e => set("fallbackAgent", e.target.value)}
                    style={{ background:T.bg3, border:`1px solid ${T.border2}`, borderRadius:5, color:T.green, fontSize:12, padding:"7px 28px 7px 12px", fontFamily:T.fontUI, outline:"none", cursor:"pointer", appearance:"none" }}>
                    <option value="anthropic">✦ Claude Sonnet</option>
                    <option value="openai">⬡ GPT-4o</option>
                    <option value="gemini">◈ Gemini</option>
                  </select>
                  <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:T.txt2, pointerEvents:"none", fontSize:11 }}>▾</span>
                </div>
              </div>

              {/* Auto-review toggle */}
              <div style={{ flex:1.5, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:8, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:T.txt, marginBottom:3 }}>Auto-review on PR open</div>
                  <div style={{ fontSize:11, color:T.txt2 }}>Trigger AI review automatically</div>
                </div>
                <Toggle checked={!!prefs.autoReview} onChange={v => set("autoReview", v)}/>
              </div>
            </div>
          </div>

          {/* Section 3: Working Directory */}
          <div ref={wdirRef}>
            <SH label="Working Directory" accent={T.cyan}
              desc="Local path used to store reviews, cache, and agent memory across sessions"
            />
            <div style={{ padding: "20px 24px 28px" }}>
              {/* Path row */}
              <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
                <div style={{
                  flex:1, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:6,
                  padding:"0 14px", height:36, display:"flex", flexDirection:"column", justifyContent:"center",
                }}>
                  <div style={{ fontSize:10, color:T.txt2, letterSpacing:"0.08em" }}>DIRECTORY PATH</div>
                  <div style={{ fontSize:12, fontFamily:T.fontMono, color:workingDir ? T.txt : T.txt3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {workingDir ?? "Not set"}
                  </div>
                </div>
                {workingDir && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    <Dot color={T.green} size={8}/>
                    <span style={{ fontSize:10, color:T.green }}>Accessible</span>
                  </div>
                )}
                <Btn variant="ghost" onClick={handleChangeDir} disabled={changing} style={{ flexShrink:0 }}>
                  {changing ? <Spinner size={12}/> : "Browse…"}
                </Btn>
                <Btn variant="subtle" onClick={handleChangeDir} disabled={changing} style={{ flexShrink:0 }}>Change</Btn>
              </div>

              {/* Stats row */}
              <div style={{ display:"flex", gap:12, alignItems:"stretch" }}>
                <div style={{ flex:1, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 18px", minHeight:60 }}>
                  <div style={{ fontSize:10, color:T.txt2, letterSpacing:"0.08em", marginBottom:6 }}>REVIEWS SAVED</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                    <span style={{ fontSize:20, fontWeight:700, fontFamily:T.fontMono, color:T.txt }}>{stats?.reviewCount ?? 0}</span>
                    <span style={{ fontSize:11, color:T.txt3 }}>reviews</span>
                  </div>
                </div>

                <div style={{ flex:1, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 18px", minHeight:60 }}>
                  <div style={{ fontSize:10, color:T.txt2, letterSpacing:"0.08em", marginBottom:6 }}>TOTAL SIZE</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                    <span style={{ fontSize:20, fontWeight:700, fontFamily:T.fontMono, color:T.txt }}>
                      {stats?.sizeBytes ? (stats.sizeBytes / 1048576).toFixed(1) : "0"}
                    </span>
                    <span style={{ fontSize:11, color:T.txt3 }}>MB</span>
                  </div>
                </div>

                <div style={{ flex:1, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 18px", minHeight:60 }}>
                  <div style={{ fontSize:10, color:T.txt2, letterSpacing:"0.08em", marginBottom:6 }}>LAST SAVED</div>
                  <span style={{ fontSize:14, fontWeight:600, color:T.txt }}>{fmtDate(stats?.lastReview)}</span>
                </div>

                <div style={{ flex:1.4, background:T.bg1, border:`1px solid ${T.border}`, borderRadius:6, padding:"12px 18px", minHeight:60, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:10, color:T.txt2, letterSpacing:"0.08em", marginBottom:4 }}>AUTO-SAVE REVIEWS</div>
                    <div style={{ fontSize:11, color:T.txt2 }}>Save after every AI run</div>
                  </div>
                  <Toggle checked={!!prefs.autoSave} onChange={v => set("autoSave", v)}/>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:8, justifyContent:"center", flexShrink:0 }}>
                  <Btn variant="ghost" onClick={() => workingDir && window.akatsuki.workdir.open(workingDir)}>
                    Open Folder
                  </Btn>
                  {confirming === "clear" ? (
                    <div style={{ display:"flex", gap:6 }}>
                      <Btn variant="danger" onClick={clearAll}>Confirm</Btn>
                      <Btn variant="subtle" onClick={() => setConfirming(null)}>Cancel</Btn>
                    </div>
                  ) : (
                    <Btn variant="danger" onClick={() => setConfirming("clear")}>Clear All</Btn>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 40 }}/>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div style={{
        height: 20, background: T.bg2, borderTop: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", padding: "0 12px",
        flexShrink: 0,
      }}>
        <Dot color={T.green} size={6}/>
        <span style={{ fontSize:10, color:T.txt3, marginLeft:6 }}>Settings</span>
        <span style={{ fontSize:10, color:T.border2, margin:"0 8px" }}>|</span>
        <span style={{ fontSize:10, color:T.txt3 }}>{activeAI} AI provider{activeAI !== 1 ? "s" : ""} active</span>
        <span style={{ fontSize:10, color:T.border2, margin:"0 8px" }}>|</span>
        <span style={{ fontSize:10, color:T.txt3 }}>{activeGit} git platform{activeGit !== 1 ? "s" : ""} connected</span>
      </div>
    </div>
  );
}

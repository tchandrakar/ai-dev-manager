import { useState, useEffect } from "react";
import { T } from "../tokens";
import { Btn, Dot, Spinner } from "../components";
import { useGitConnections } from "../store/AppContext";

// OAuth entry-point URLs
const OAUTH_URLS = {
  github:    "https://github.com/settings/tokens/new?description=Akatsuki+AI+Reviewer",
  gitlab:    "https://gitlab.com/-/profile/personal_access_tokens",
  bitbucket: "https://id.atlassian.com/manage-profile/security/api-tokens",
};

// ── Git Platform Card ─────────────────────────────────────────────────────────
function GitPlatformCard({ id, label, sublabel, icon, iconColor, conn, onSave, onDisconnect }) {
  const [token,        setToken]       = useState(conn.token     ?? "");
  const [email,        setEmail]       = useState(conn.email     ?? "");
  const [workspace,    setWorkspace]   = useState(conn.workspace ?? "");
  const [visible,      setVisible]     = useState(false);
  const [testing,      setTesting]     = useState(false);
  const [testResult,   setTestResult]  = useState(null);
  const [workspaces,   setWorkspaces]  = useState([]);
  const [detectingWs,  setDetectingWs] = useState(false);
  const [connecting,   setConnecting]  = useState(false);
  const [connectError, setConnectError]= useState(null);
  const connected = !!(conn.connected && conn.token);
  const isBB = id === "bitbucket";

  useEffect(() => { setWorkspace(conn.workspace ?? ""); }, [conn.workspace]);
  useEffect(() => { setEmail(conn.email ?? ""); }, [conn.email]);

  async function handleTestAuth() {
    setTesting(true); setTestResult(null);
    const res = await window.akatsuki.git.testAuth({
      platform: id, token: conn.token,
      instanceUrl: conn.instanceUrl,
      workspace: conn.workspace,
      username: conn.username,
      email: conn.email,
    });
    setTestResult(res); setTesting(false);
  }

  async function handleBBConnect() {
    setConnecting(true); setConnectError(null);
    const res = await window.akatsuki.git.testAuth({ platform: "bitbucket", token, email });
    if (res.ok) {
      onSave("bitbucket", { ...conn, token, email, connected: true, username: res.username });
      const wsRes = await window.akatsuki.git.bitbucketWorkspaces({ token, email });
      if (wsRes.workspaces) setWorkspaces(wsRes.workspaces);
    } else {
      setConnectError(res.error);
    }
    setConnecting(false);
  }

  async function handleDetectWorkspaces() {
    setDetectingWs(true);
    const res = await window.akatsuki.git.bitbucketWorkspaces({ token: conn.token, email: conn.email });
    if (res.workspaces) setWorkspaces(res.workspaces);
    setDetectingWs(false);
  }

  function saveWorkspace(slug) {
    setWorkspace(slug);
    onSave(id, { ...conn, workspace: slug });
  }

  const urlLabel   = { github: "Account", gitlab: "Instance URL", bitbucket: "Workspace (optional)" };
  const urlDisplay = {
    github:    conn.username  || (connected ? "connected" : ""),
    gitlab:    conn.instanceUrl || "https://gitlab.com",
  };
  const maskedPAT = {
    github:    "ghp_••••••••••••••••••••",
    gitlab:    "glpat-••••••••••••••••",
    bitbucket: "ATB••••••••••",
  };
  const inputStyle = {
    flex: 1, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 5,
    padding: "6px 12px", fontSize: 12, fontFamily: T.fontMono, color: T.txt3, outline: "none",
  };

  return (
    <div style={{
      flex: 1, background: T.bg1, borderRadius: 10, overflow: "hidden",
      border: `1px solid ${connected ? T.border : T.border2}`,
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      boxShadow: connected ? `0 0 0 1px ${T.green}20` : "none",
      ...(!connected && { borderStyle: "dashed" }),
    }}>
      {/* header */}
      <div style={{
        height: 48, background: T.bg2, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 16px 0 18px",
        borderBottom: `3px solid ${connected ? `${T.green}40` : T.border}`,
        transition: "border-color 0.2s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: T.bg3,
            border: `1px solid ${T.border2}`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 14, color: iconColor,
          }}>{icon}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: 11, color: T.txt2 }}>{sublabel}</div>
          </div>
        </div>
        {connected
          ? <span style={{ display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.green,background:`${T.green}18`,border:`1px solid ${T.green}40`,padding:"2px 8px",borderRadius:9,fontWeight:600 }}>
              <Dot color={T.green} size={6}/> Connected
            </span>
          : <span style={{ display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.txt2,background:T.bg3,border:`1px solid ${T.border}`,padding:"2px 8px",borderRadius:9 }}>
              <Dot color={T.txt3} size={5}/> Not Connected
            </span>
        }
      </div>

      {/* body */}
      <div style={{ padding: "14px 18px" }}>

        {/* Bitbucket: editable workspace with Detect */}
        {isBB ? (
          <>
            {connected && conn.username && (
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <span style={{ fontSize:11, color:T.txt2 }}>Authenticated as</span>
                <span style={{ fontSize:11, fontWeight:600, color:T.green }}>@{conn.username}</span>
              </div>
            )}
            <div style={{ fontSize:11, color:T.txt2, marginBottom:4 }}>
              Workspace <span style={{ color:T.txt3 }}>(optional)</span>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {workspaces.length > 0 ? (
                <div style={{ position:"relative", flex:1 }}>
                  <select value={workspace} onChange={e => saveWorkspace(e.target.value)}
                    style={{ width:"100%", background:T.bg3, border:`1px solid ${T.border2}`, borderRadius:5,
                      color:T.txt, fontSize:12, padding:"6px 28px 6px 12px", fontFamily:T.fontMono,
                      outline:"none", cursor:"pointer", appearance:"none" }}>
                    <option value="">— any workspace —</option>
                    {workspaces.map(w => (
                      <option key={w.slug} value={w.slug}>{w.name} ({w.slug})</option>
                    ))}
                  </select>
                  <span style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.txt2,pointerEvents:"none",fontSize:10 }}>▾</span>
                </div>
              ) : (
                <input type="text" value={workspace}
                  onChange={e => setWorkspace(e.target.value)}
                  onBlur={() => workspace !== conn.workspace && onSave(id, { ...conn, workspace })}
                  placeholder="workspace-slug  (leave blank to use all)"
                  style={inputStyle}
                />
              )}
              {connected && (
                <Btn variant="subtle" onClick={handleDetectWorkspaces} disabled={detectingWs}>
                  {detectingWs ? <Spinner size={10}/> : "Detect"}
                </Btn>
              )}
            </div>
          </>
        ) : (
          /* GitHub / GitLab: static account/URL display */
          <>
            <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>{urlLabel[id]}</div>
            <div style={{
              background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 5,
              padding: "7px 14px", fontSize: 12, fontFamily: T.fontMono,
              color: connected ? T.txt : T.txt3, marginBottom: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between", overflow: "hidden",
            }}>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {urlDisplay[id] || urlLabel[id].toLowerCase()}
              </span>
              {connected && <span style={{ color:T.green, flexShrink:0, marginLeft:8 }}>✓</span>}
            </div>
          </>
        )}

        {/* Bitbucket: Atlassian email */}
        {isBB && (
          <>
            <div style={{ fontSize:11, color:T.txt2, marginBottom:4 }}>Atlassian Email</div>
            <input type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => connected && email !== conn.email && onSave(id, { ...conn, email })}
              placeholder="you@example.com"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
          </>
        )}

        {/* Token field */}
        <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>
          {isBB ? "API Token" : "Personal Access Token"}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            type={visible ? "text" : "password"}
            value={token}
            onChange={e => { setToken(e.target.value); setConnectError(null); }}
            placeholder={connected ? maskedPAT[id] : `Enter ${id} ${isBB ? "API token" : "token"}...`}
            style={inputStyle}
          />
          <Btn variant="subtle" onClick={() => setVisible(v => !v)}>👁</Btn>
        </div>

        {/* Bitbucket: inline connect error */}
        {isBB && connectError && (
          <div style={{ fontSize:11, color:T.red, marginBottom:10 }}>✗ {connectError}</div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {connected ? (
            <>
              <Btn variant="danger" onClick={() => {
                onDisconnect(id); setToken(""); setTestResult(null);
                setWorkspaces([]); setWorkspace("");
              }}>Disconnect</Btn>
              <Btn variant="ghost" onClick={handleTestAuth} disabled={testing}>
                {testing ? "Testing…" : "Test Auth"}
              </Btn>
              {testResult && (
                testResult.ok
                  ? <span style={{ fontSize:11, color:T.green }}>✓ @{testResult.username}</span>
                  : <span style={{ fontSize:11, color:T.red }}>✗ {testResult.error}</span>
              )}
            </>
          ) : (
            <>
              {isBB ? (
                <Btn variant="primary" disabled={!token || !email || connecting} onClick={handleBBConnect}>
                  {connecting ? <Spinner size={12}/> : `Connect ${label}`}
                </Btn>
              ) : (
                <Btn variant="primary" disabled={!token}
                  onClick={() => token && onSave(id, { ...conn, token, connected: true })}>
                  Connect {label}
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => window.akatsuki.shell.openExternal(OAUTH_URLS[id])}>
                {isBB ? "Get Token →" : "OAuth →"}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ScreenConnectors() {
  const { connections, setConnection } = useGitConnections();

  const gitPlatforms = [
    { id: "github",    label: "GitHub",    sublabel: "github.com",    icon: "⎇", iconColor: T.txt },
    { id: "gitlab",    label: "GitLab",    sublabel: "gitlab.com",    icon: "⬡", iconColor: T.amber },
    { id: "bitbucket", label: "Bitbucket", sublabel: "bitbucket.org", icon: "⛁", iconColor: T.blue },
  ];

  const activeGit = gitPlatforms.filter(p => connections[p.id]?.connected).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:T.bg0, fontFamily:T.fontUI }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 44, background: T.bg2, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", padding: "0 20px",
        flexShrink: 0, WebkitAppRegion: "drag",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.txt }}>Git Connectors</span>
        <div style={{ marginLeft: "auto", display:"flex", alignItems:"center", gap:6, WebkitAppRegion:"no-drag" }}>
          <Dot color={activeGit > 0 ? T.green : T.txt3} size={6}/>
          <span style={{ fontSize: 11, color: T.txt2 }}>
            {activeGit} of {gitPlatforms.length} connected
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 24px" }}>

        {/* Intro */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.txt, marginBottom: 6 }}>
            Repository Connections
          </div>
          <div style={{ fontSize: 12, color: T.txt2, lineHeight: 1.6, maxWidth: 560 }}>
            Connect your git platforms so Sharingan can automatically pull PR diffs for review.
            Tokens are stored locally in your working directory — never sent to any server.
          </div>
        </div>

        {/* Platform cards */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {gitPlatforms.map(p => (
            <GitPlatformCard key={p.id} {...p}
              conn={connections[p.id] ?? {}}
              onSave={(id, cfg) => setConnection(id, cfg)}
              onDisconnect={id => setConnection(id, { connected: false, token: "", username: "" })}
            />
          ))}
        </div>

        {/* Help footer */}
        <div style={{
          marginTop: 28, padding: "14px 18px", background: T.bg1,
          border: `1px solid ${T.border}`, borderRadius: 8,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 16, color: T.cyan, flexShrink: 0, marginTop: 1 }}>ⓘ</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.txt, marginBottom: 4 }}>
              Token Permissions
            </div>
            <div style={{ fontSize: 11, color: T.txt2, lineHeight: 1.6 }}>
              <span style={{ color: T.txt }}>GitHub:</span> needs <code style={{ fontFamily: T.fontMono, color: T.cyan }}>repo</code> scope &nbsp;·&nbsp;{" "}
              <span style={{ color: T.txt }}>GitLab:</span> needs <code style={{ fontFamily: T.fontMono, color: T.cyan }}>read_api</code> &nbsp;·&nbsp;{" "}
              <span style={{ color: T.txt }}>Bitbucket:</span> needs <code style={{ fontFamily: T.fontMono, color: T.cyan }}>Pull Requests: Read</code>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        height: 20, background: T.bg2, borderTop: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0,
      }}>
        <Dot color={activeGit > 0 ? T.green : T.txt3} size={6}/>
        <span style={{ fontSize: 10, color: T.txt3, marginLeft: 6 }}>Connectors</span>
        <span style={{ fontSize: 10, color: T.border2, margin: "0 8px" }}>|</span>
        <span style={{ fontSize: 10, color: T.txt3 }}>
          {activeGit} platform{activeGit !== 1 ? "s" : ""} connected
        </span>
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { T } from "../tokens";
import { useKawaii } from "./KawaiiApp";
import { DB_TYPES } from "./mockData";
import { Btn, PanelHeader, Dot } from "../components";

// ── Sidebar Row ──────────────────────────────────────────────────────────────
function SidebarRow({ label, icon, count, active, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        height: 30, padding: "0 12px", cursor: "pointer",
        background: active ? T.bg3 : "transparent",
        borderLeft: active ? `3px solid ${accent || T.teal}` : "3px solid transparent",
        borderRadius: active ? "0 4px 4px 0" : 0,
        transition: "background 0.15s",
      }}
    >
      {icon && <span style={{ fontSize: 12, color: active ? (accent || T.teal) : T.txt3, flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: 12, color: active ? T.txt : T.txt2, fontWeight: active ? 600 : 400, flex: 1, fontFamily: T.fontUI }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>{count}</span>
      )}
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const isOnline = status === "online";
  const color = isOnline ? T.green : T.txt3;
  const label = isOnline ? "Online" : "Offline";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 9, fontSize: 9, fontWeight: 600,
      background: `${color}18`, border: `1px solid ${color}40`, color,
      fontFamily: T.fontUI,
    }}>
      <Dot color={color} size={5} /> {label}
    </span>
  );
}

// ── Connection Card ──────────────────────────────────────────────────────────
function ConnectionCard({ conn, isActive, onConnect, onDisconnect, onEdit, onDelete, onToggleFavorite, connecting, error }) {
  const [hov, setHov] = useState(false);
  const dbType = DB_TYPES[conn.type] || { abbr: "??", color: T.txt3 };
  const isOnline = conn.status === "online";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: T.bg1, borderRadius: 10, overflow: "hidden",
        border: `1px solid ${isActive ? T.teal : hov ? T.border2 : T.border}`,
        transition: "border-color 0.2s, transform 0.15s",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        display: "flex", flexDirection: "column",
        boxShadow: isActive ? `0 0 0 1px ${T.teal}40` : "none",
      }}
    >
      {/* Card Header */}
      <div style={{
        height: 48, background: T.bg2, padding: "0 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${T.border}`,
        borderRadius: "10px 10px 0 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: T.bg3,
            border: `1px solid ${T.border2}`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 11, fontWeight: 700, color: dbType.color,
            fontFamily: T.fontMono, flexShrink: 0,
          }}>{dbType.abbr}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, lineHeight: 1.2 }}>{conn.name}</div>
            <div style={{ fontSize: 10, color: T.txt2 }}>{conn.version || dbType.label}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isActive && (
            <span style={{ fontSize: 9, color: T.teal, fontWeight: 700, fontFamily: T.fontUI }}>ACTIVE</span>
          )}
          <StatusBadge status={conn.status} />
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: "12px 14px", flex: 1, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.txt3, width: 64, flexShrink: 0, fontFamily: T.fontUI }}>
              {conn.type === "sqlite" ? "Path" : "Host"}
            </span>
            <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conn.host}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.txt3, width: 64, flexShrink: 0, fontFamily: T.fontUI }}>Database</span>
            <span style={{ fontSize: 11, color: T.txt, fontFamily: T.fontMono }}>{conn.database}</span>
          </div>
          {conn.lastUsed && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: T.txt3, width: 64, flexShrink: 0, fontFamily: T.fontUI }}>Last used</span>
              <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontMono }}>{conn.lastUsed}</span>
            </div>
          )}
        </div>

        {/* Favorite star */}
        <span
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(conn.id); }}
          style={{
            position: "absolute", bottom: 10, right: 14, fontSize: 16, cursor: "pointer",
            color: conn.favorite ? T.teal : T.txt3,
            transition: "color 0.15s",
          }}
        >
          {conn.favorite ? "\u2605" : "\u2606"}
        </span>
      </div>

      {/* Connection error */}
      {error && (
        <div style={{
          margin: "0 14px 8px", padding: "6px 10px", borderRadius: 6,
          background: `${T.red}14`, border: `1px solid ${T.red}30`,
          fontSize: 11, color: T.red, fontFamily: T.fontUI, lineHeight: 1.4,
        }}>
          {error}
        </div>
      )}

      {/* Card Footer */}
      <div style={{ padding: "0 14px 12px", display: "flex", gap: 8 }}>
        {isOnline ? (
          isActive ? (
            <Btn
              variant="ghost"
              onClick={() => onDisconnect(conn)}
              style={{ flex: 1, color: T.red, border: `1px solid ${T.red}40` }}
            >
              Disconnect
            </Btn>
          ) : (
            <Btn
              variant="success"
              onClick={() => onConnect(conn)}
              style={{
                flex: 1,
                background: `${T.teal}18`, border: `1px solid ${T.teal}40`, color: T.teal,
              }}
            >
              Connect
            </Btn>
          )
        ) : (
          <Btn variant="ghost" onClick={() => onConnect(conn)} disabled={connecting} style={{ flex: 1 }}>
            {connecting ? "Connecting..." : "Connect"}
          </Btn>
        )}
        <Btn variant="ghost" onClick={() => onEdit(conn)} style={{ flex: 1 }}>
          Edit
        </Btn>
        <Btn
          variant="danger"
          onClick={() => onDelete(conn)}
          title="Delete connection"
        >
          Delete
        </Btn>
      </div>
    </div>
  );
}

// ── Filter Pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 500,
        cursor: "pointer", fontFamily: T.fontUI, transition: "all 0.15s",
        background: active ? `${T.teal}18` : "transparent",
        border: `1px solid ${active ? `${T.teal}40` : T.border2}`,
        color: active ? T.teal : T.txt2,
      }}
    >
      {label}
    </span>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirm({ conn, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1001,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.60)" }} />
      <div style={{
        position: "relative", width: 400, background: T.bg1,
        border: `1px solid ${T.border}`, borderRadius: 10, padding: 24,
        animation: "pop 0.15s ease-out",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txt, marginBottom: 8, fontFamily: T.fontUI }}>
          Delete Connection
        </div>
        <div style={{ fontSize: 12, color: T.txt2, marginBottom: 20, fontFamily: T.fontUI, lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: T.txt }}>{conn.name}</strong>?
          This action cannot be undone.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ── New/Edit Connection Modal ────────────────────────────────────────────────
function ConnectionModal({ editConn, onClose, onSave, onSaveAndGo }) {
  const isEdit = !!editConn;

  const [selectedDbType, setSelectedDbType] = useState(editConn?.type || "mysql");
  const [formData, setFormData] = useState(() => {
    if (editConn) {
      return {
        name: editConn.name || "",
        host: editConn.host || "",
        port: editConn.port || String(DB_TYPES[editConn.type]?.defaultPort || ""),
        database: editConn.database || "",
        username: editConn.username || "",
        password: editConn.password || "",
        sshEnabled: editConn.sshEnabled || false,
        sshHost: editConn.sshHost || "",
        sshPort: editConn.sshPort || "22",
        sshUser: editConn.sshUser || "",
        sshKey: editConn.sshKey || "",
        timeout: editConn.timeout || "30",
        charset: editConn.charset || "utf8mb4",
        sslMode: editConn.sslMode || "Preferred",
      };
    }
    return {
      name: "", host: "", port: "", database: "",
      username: "", password: "",
      sshEnabled: false, sshHost: "", sshPort: "22", sshUser: "", sshKey: "",
      timeout: "30", charset: "utf8mb4", sslMode: "Preferred",
    };
  });
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [inputMode, setInputMode] = useState("form"); // "form" | "string"
  const [connString, setConnString] = useState("");
  const [parseError, setParseError] = useState(null);

  const upd = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  // ── Connection string parser ──────────────────────────────────────────────
  const PROTOCOL_MAP = {
    postgresql: "postgresql", postgres: "postgresql", pg: "postgresql",
    mysql: "mysql", mariadb: "mariadb",
    mongodb: "mongodb", "mongodb+srv": "mongodb",
    redis: "redis", rediss: "redis",
    sqlite: "sqlite", sqlite3: "sqlite",
    oracle: "oracle", oracledb: "oracle",
    sqlserver: "sqlserver", mssql: "sqlserver",
  };

  const parseConnString = () => {
    setParseError(null);
    const s = connString.trim();
    if (!s) { setParseError("Paste a connection string first"); return; }

    try {
      // SQLite special case: sqlite:///path or just a file path
      if (/^sqlite/i.test(s)) {
        const filePath = s.replace(/^sqlite3?:\/\/\/?/i, "");
        setSelectedDbType("sqlite");
        upd("host", filePath);
        upd("database", filePath.split("/").pop().replace(/\.db$/, ""));
        if (!formData.name) upd("name", filePath.split("/").pop());
        setInputMode("form");
        return;
      }

      // Parse URI: protocol://user:pass@host:port/database?params
      const match = s.match(/^([a-zA-Z0-9+]+):\/\/(?:([^:@]+)?(?::([^@]*))?@)?([^/:?]+)?(?::(\d+))?(?:\/([^?;]*))?(?:[?;](.*))?$/);
      if (!match) { setParseError("Could not parse connection string. Expected format: protocol://user:pass@host:port/database"); return; }

      const [, protocol, user, pass, host, port, database, params] = match;
      const dbType = PROTOCOL_MAP[protocol.toLowerCase()];
      if (!dbType) { setParseError(`Unknown protocol "${protocol}". Supported: postgresql, mysql, mongodb, mariadb, redis, oracle, sqlserver, sqlite`); return; }

      setSelectedDbType(dbType);
      const db = DB_TYPES[dbType];
      if (host) upd("host", host);
      upd("port", port || String(db?.defaultPort || ""));
      if (user) upd("username", decodeURIComponent(user));
      if (pass) upd("password", decodeURIComponent(pass));

      // SQL Server uses ;database=name in params
      let dbName = database || "";
      if (params) {
        const dbParam = params.match(/(?:^|[;&])database=([^;&]+)/i);
        if (dbParam) dbName = dbParam[1];
      }
      if (dbName) upd("database", decodeURIComponent(dbName));

      // Auto-generate name if empty
      if (!formData.name) {
        upd("name", `${db?.label || dbType} - ${host || "local"}${dbName ? ` / ${dbName}` : ""}`);
      }

      setInputMode("form");
    } catch (e) {
      setParseError("Failed to parse: " + e.message);
    }
  };

  const dbTypeList = Object.entries(DB_TYPES);
  const selectedDb = DB_TYPES[selectedDbType];

  const handleDbTypeChange = (type) => {
    setSelectedDbType(type);
    const db = DB_TYPES[type];
    if (db && db.defaultPort) {
      upd("port", String(db.defaultPort));
    } else {
      upd("port", "");
    }
  };

  // Build connection URL
  const connUrl = useMemo(() => {
    const db = DB_TYPES[selectedDbType];
    if (!db) return "";
    const host = formData.host || "localhost";
    const port = formData.port || (db.defaultPort || "");
    const user = formData.username || "root";
    const dbName = formData.database || "mydb";
    if (selectedDbType === "sqlite") return `sqlite:///${formData.host || "~/database.db"}`;
    if (selectedDbType === "mongodb") return `mongodb://${user}@${host}:${port}/${dbName}`;
    return `${selectedDbType}://${user}@${host}${port ? `:${port}` : ""}/${dbName}`;
  }, [selectedDbType, formData.host, formData.port, formData.username, formData.database]);

  // Validate form — returns error message or null
  const validate = () => {
    if (!formData.name.trim()) return "Connection name is required";
    if (selectedDbType !== "sqlite" && !formData.host.trim()) return "Host is required";
    if (selectedDbType === "sqlite" && !formData.host.trim()) return "File path is required";
    if (!formData.database.trim()) return "Database name is required";
    return null;
  };

  // Build connection object
  const buildConnection = () => {
    const db = DB_TYPES[selectedDbType];
    const now = new Date();
    const version = db ? `${db.label} ${db.versions.split("/")[0].trim().replace("v", "")}` : "";
    return {
      id: editConn?.id || `c-${Date.now()}`,
      name: formData.name.trim(),
      type: selectedDbType,
      version,
      host: formData.host.trim() + (formData.port && selectedDbType !== "sqlite" ? `:${formData.port}` : ""),
      database: formData.database.trim(),
      status: editConn?.status || "offline",
      favorite: editConn?.favorite || false,
      folder: editConn?.folder || null,
      lastUsed: editConn?.lastUsed || "Just now",
      // Store extra fields for editing later
      port: formData.port,
      username: formData.username,
      password: formData.password,
      sshEnabled: formData.sshEnabled,
      sshHost: formData.sshHost,
      sshPort: formData.sshPort,
      sshUser: formData.sshUser,
      sshKey: formData.sshKey,
      timeout: formData.timeout,
      charset: formData.charset,
      sslMode: formData.sslMode,
    };
  };

  const handleSave = () => {
    const err = validate();
    if (err) { setTestResult({ type: "error", msg: err }); return; }
    onSave(buildConnection());
  };

  const handleSaveAndGo = async () => {
    const err = validate();
    if (err) { setTestResult({ type: "error", msg: err }); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await window.akatsuki.kawaiidb.testConnection({
        type: selectedDbType,
        host: formData.host.trim(),
        port: formData.port || null,
        database: formData.database.trim(),
        username: formData.username,
        password: formData.password,
      });
      if (result.ok) {
        const conn = buildConnection();
        conn.status = "online";
        onSaveAndGo(conn);
      } else {
        setTestResult({ type: "error", msg: result.msg });
      }
    } catch (e) {
      setTestResult({ type: "error", msg: e.message || "Connection failed" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const err = validate();
    if (err) { setTestResult({ type: "error", msg: err }); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await window.akatsuki.kawaiidb.testConnection({
        type: selectedDbType,
        host: formData.host.trim(),
        port: formData.port || null,
        database: formData.database.trim(),
        username: formData.username,
        password: formData.password,
      });
      setTestResult({
        type: result.ok ? "success" : "error",
        msg: result.ok ? `\u2714 ${result.msg}` : result.msg,
      });
    } catch (e) {
      setTestResult({ type: "error", msg: e.message || "Connection test failed" });
    } finally {
      setTestLoading(false);
    }
  };

  const driverProps = [
    { prop: "allowPublicKeyRetrieval", value: "true", color: T.green },
    { prop: "useSSL", value: "false", color: T.red },
    { prop: "serverTimezone", value: "UTC", color: T.txt },
  ];

  const inputStyle = {
    background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 6,
    color: T.txt, fontSize: 12, fontFamily: T.fontUI, padding: "8px 12px",
    outline: "none", width: "100%",
  };

  const labelStyle = { fontSize: 11, color: T.txt2, marginBottom: 4, fontFamily: T.fontUI };

  const sectionHeader = (title, accent = T.teal) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 14, marginTop: 4,
    }}>
      <div style={{ width: 3, height: 16, background: accent, borderRadius: 2 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: T.txt, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: T.fontUI }}>{title}</span>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.70)",
      }} />

      <div style={{
        position: "relative", width: 1000, maxHeight: 880, background: T.bg1,
        border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden",
        display: "flex", flexDirection: "column",
        animation: "pop 0.2s ease-out",
      }}>
        {/* Title Bar */}
        <div style={{
          height: 44, background: T.bg2, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 16px", flexShrink: 0,
          borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.txt, fontFamily: T.fontUI }}>
            {isEdit ? `Edit Connection — ${editConn.name}` : "New Connection"}
          </span>
          <span
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: T.txt2, fontSize: 16, background: "transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.bg3}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {"\u2715"}
          </span>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left Panel - DB Type Selector */}
          <div style={{
            width: 220, background: T.bg2, borderRight: `1px solid ${T.border}`,
            flexShrink: 0, overflow: "hidden auto",
          }}>
            <PanelHeader title="DATABASE TYPE" accent={T.teal} />
            <div style={{ padding: "6px 0" }}>
              {dbTypeList.map(([key, db]) => {
                const isActive = selectedDbType === key;
                return (
                  <div
                    key={key}
                    onClick={() => handleDbTypeChange(key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      height: 38, padding: "0 16px", cursor: "pointer",
                      background: isActive ? T.bg3 : "transparent",
                      borderLeft: isActive ? `3px solid ${T.teal}` : "3px solid transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <Dot color={db.color} size={8} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? T.txt : T.txt2, fontFamily: T.fontUI }}>{db.label}</div>
                      <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.fontMono }}>{db.versions}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel - Form */}
          <div style={{ flex: 1, overflow: "hidden auto", padding: "18px 24px 18px 24px" }}>

            {/* ── Input Mode Toggle ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0, marginBottom: 16,
              background: T.bg3, borderRadius: 8, padding: 3, width: "fit-content",
            }}>
              {[{ key: "form", label: "Form" }, { key: "string", label: "Connection String" }].map(m => (
                <div
                  key={m.key}
                  onClick={() => setInputMode(m.key)}
                  style={{
                    padding: "5px 16px", borderRadius: 6, cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: T.fontUI,
                    background: inputMode === m.key ? T.bg4 : "transparent",
                    color: inputMode === m.key ? T.txt : T.txt3,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* ── Connection String Input ── */}
            {inputMode === "string" && (
              <div style={{ marginBottom: 20 }}>
                <div style={labelStyle}>Paste your connection string</div>
                <textarea
                  value={connString}
                  onChange={e => setConnString(e.target.value)}
                  placeholder={
                    selectedDbType === "sqlite"
                      ? "sqlite:///path/to/database.db"
                      : selectedDbType === "mongodb"
                      ? "mongodb://user:password@localhost:27017/mydb"
                      : selectedDbType === "redis"
                      ? "redis://user:password@localhost:6379/0"
                      : selectedDbType === "sqlserver"
                      ? "sqlserver://user:password@localhost:1433;database=mydb"
                      : `${selectedDbType}://user:password@localhost:${DB_TYPES[selectedDbType]?.defaultPort || ""}/mydb`
                  }
                  style={{
                    ...inputStyle, fontFamily: T.fontMono, minHeight: 64,
                    resize: "vertical", width: "100%",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <Btn variant="primary" onClick={parseConnString}>
                    Parse & Fill Form
                  </Btn>
                  {parseError && (
                    <span style={{ fontSize: 11, color: T.red, fontFamily: T.fontUI }}>{parseError}</span>
                  )}
                </div>
                <div style={{
                  marginTop: 12, padding: "8px 12px", borderRadius: 6,
                  background: T.bg2, border: `1px solid ${T.border}`,
                  fontSize: 10, color: T.txt3, fontFamily: T.fontUI, lineHeight: 1.6,
                }}>
                  <div style={{ fontWeight: 700, color: T.txt2, marginBottom: 4 }}>Supported formats:</div>
                  <div><span style={{ color: T.green, fontFamily: T.fontMono }}>postgresql://</span>user:pass@host:5432/dbname</div>
                  <div><span style={{ color: T.blue, fontFamily: T.fontMono }}>mysql://</span>user:pass@host:3306/dbname</div>
                  <div><span style={{ color: T.amber, fontFamily: T.fontMono }}>mongodb://</span>user:pass@host:27017/dbname</div>
                  <div><span style={{ color: T.cyan, fontFamily: T.fontMono }}>mariadb://</span>user:pass@host:3306/dbname</div>
                  <div><span style={{ color: T.red, fontFamily: T.fontMono }}>redis://</span>user:pass@host:6379/0</div>
                  <div><span style={{ color: T.purple, fontFamily: T.fontMono }}>sqlite:///</span>path/to/database.db</div>
                  <div><span style={{ color: T.blue, fontFamily: T.fontMono }}>sqlserver://</span>user:pass@host:1433;database=name</div>
                  <div><span style={{ color: T.amber, fontFamily: T.fontMono }}>oracle://</span>user:pass@host:1521/service</div>
                </div>
              </div>
            )}

            {/* GENERAL */}
            {sectionHeader("General")}

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Connection Name *</div>
              <input
                type="text" value={formData.name}
                onChange={e => upd("name", e.target.value)}
                placeholder={`My ${selectedDb?.label || "Database"} Connection`}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 3 }}>
                <div style={labelStyle}>{selectedDbType === "sqlite" ? "File Path *" : "Host *"}</div>
                <input
                  type="text" value={formData.host}
                  onChange={e => upd("host", e.target.value)}
                  placeholder={selectedDbType === "sqlite" ? "~/dev/database.db" : "localhost"}
                  style={inputStyle}
                />
              </div>
              {selectedDbType !== "sqlite" && (
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Port</div>
                  <input
                    type="text" value={formData.port}
                    onChange={e => upd("port", e.target.value)}
                    placeholder={String(selectedDb?.defaultPort || "")}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Database *</div>
              <input
                type="text" value={formData.database}
                onChange={e => upd("database", e.target.value)}
                placeholder="my_database"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Username</div>
                <input
                  type="text" value={formData.username}
                  onChange={e => upd("username", e.target.value)}
                  placeholder="root"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Password</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={e => upd("password", e.target.value)}
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      width: 36, height: 36, borderRadius: 6, display: "flex",
                      alignItems: "center", justifyContent: "center", cursor: "pointer",
                      background: T.bg3, border: `1px solid ${T.border2}`, color: T.txt2,
                      fontSize: 14, flexShrink: 0, transition: "background 0.15s",
                    }}
                  >
                    {showPassword ? "\uD83D\uDC41" : "\uD83D\uDC41\u200D\uD83D\uDDE8"}
                  </span>
                </div>
              </div>
            </div>

            {/* SSH TUNNEL */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 14, marginTop: 4,
            }}>
              <div style={{ width: 3, height: 16, background: T.txt3, borderRadius: 2 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.txt, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: T.fontUI, flex: 1 }}>SSH Tunnel</span>
              <div
                onClick={() => upd("sshEnabled", !formData.sshEnabled)}
                style={{
                  width: 36, height: 20, borderRadius: 10, cursor: "pointer", flexShrink: 0,
                  background: formData.sshEnabled ? T.green : T.bg4, position: "relative", transition: "background 0.2s",
                  border: `1px solid ${formData.sshEnabled ? T.green : T.border2}`,
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: formData.sshEnabled ? 17 : 2,
                  width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                }} />
              </div>
            </div>

            <div style={{ opacity: formData.sshEnabled ? 1 : 0.35, pointerEvents: formData.sshEnabled ? "auto" : "none", transition: "opacity 0.2s" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 3 }}>
                  <div style={labelStyle}>SSH Host</div>
                  <input
                    type="text" value={formData.sshHost}
                    onChange={e => upd("sshHost", e.target.value)}
                    placeholder="ssh.example.com"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>SSH Port</div>
                  <input
                    type="text" value={formData.sshPort}
                    onChange={e => upd("sshPort", e.target.value)}
                    placeholder="22"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>SSH Username</div>
                  <input
                    type="text" value={formData.sshUser}
                    onChange={e => upd("sshUser", e.target.value)}
                    placeholder="ubuntu"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>SSH Key</div>
                  <input
                    type="text" value={formData.sshKey}
                    onChange={e => upd("sshKey", e.target.value)}
                    placeholder="~/.ssh/id_rsa"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* ADVANCED OPTIONS */}
            {sectionHeader("Advanced Options")}

            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 160 }}>
                <div style={labelStyle}>Connection Timeout</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="text" value={formData.timeout}
                    onChange={e => upd("timeout", e.target.value)}
                    style={{ ...inputStyle, width: 120 }}
                  />
                  <span style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>seconds</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Character Set</div>
                <div style={{ position: "relative" }}>
                  <select
                    value={formData.charset}
                    onChange={e => upd("charset", e.target.value)}
                    style={{
                      ...inputStyle, cursor: "pointer", appearance: "none",
                      paddingRight: 28,
                    }}
                  >
                    <option value="utf8mb4">utf8mb4</option>
                    <option value="utf8">utf8</option>
                    <option value="latin1">latin1</option>
                    <option value="ascii">ascii</option>
                  </select>
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.txt2, pointerEvents: "none", fontSize: 11 }}>{"\u25BE"}</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>SSL Mode</div>
                <div style={{ position: "relative" }}>
                  <select
                    value={formData.sslMode}
                    onChange={e => upd("sslMode", e.target.value)}
                    style={{
                      ...inputStyle, cursor: "pointer", appearance: "none",
                      paddingRight: 28,
                    }}
                  >
                    <option value="Preferred">Preferred</option>
                    <option value="Required">Required</option>
                    <option value="Disabled">Disabled</option>
                    <option value="Verify CA">Verify CA</option>
                    <option value="Verify Full">Verify Full</option>
                  </select>
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.txt2, pointerEvents: "none", fontSize: 11 }}>{"\u25BE"}</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={labelStyle}>Connection URL <span style={{ color: T.txt3 }}>(auto-generated, read-only)</span></div>
              <div style={{
                background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6,
                padding: "8px 12px", fontSize: 11, fontFamily: T.fontMono, color: T.txt2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {connUrl}
              </div>
            </div>

            {/* DRIVER PROPERTIES */}
            {sectionHeader("Driver Properties", T.cyan)}

            <div style={{
              borderRadius: 6, overflow: "hidden", marginBottom: 20,
              border: `1px solid ${T.border}`,
            }}>
              <div style={{
                display: "flex", height: 30, background: T.bg2,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <div style={{ flex: 1, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: T.txt3, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: T.fontUI }}>Property</div>
                <div style={{ flex: 1, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: T.txt3, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: T.fontUI }}>Value</div>
              </div>
              {driverProps.map((dp, i) => (
                <div key={dp.prop} style={{
                  display: "flex", height: 32, background: i % 2 === 0 ? T.bg1 : T.bg2,
                  borderBottom: i < driverProps.length - 1 ? `1px solid ${T.border}` : "none",
                }}>
                  <div style={{ flex: 1, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 11, color: T.txt2, fontFamily: T.fontMono }}>{dp.prop}</div>
                  <div style={{ flex: 1, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 11, color: dp.color, fontFamily: T.fontMono, fontWeight: 600 }}>{dp.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          height: 52, background: T.bg2, borderTop: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Btn
              variant="success"
              onClick={handleTestConnection}
              disabled={testLoading}
              style={{
                background: `${T.teal}14`, border: `1px solid ${T.teal}40`, color: T.teal,
              }}
            >
              {testLoading ? "Testing..." : "Test Connection"}
            </Btn>
            {testResult?.type === "success" && (
              <span style={{ fontSize: 11, color: T.green, fontWeight: 600, fontFamily: T.fontUI }}>
                {"\u2713"} {testResult.msg}
              </span>
            )}
            {testResult?.type === "error" && (
              <span style={{ fontSize: 11, color: T.red, fontWeight: 600, fontFamily: T.fontUI }}>
                {"\u2717"} {testResult.msg}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn
              variant="success"
              onClick={handleSave}
              style={{ background: `${T.teal}18`, border: `1px solid ${T.teal}40`, color: T.teal }}
            >
              Save
            </Btn>
            <Btn variant="primary" onClick={handleSaveAndGo}>
              Save &amp; Go
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function ScreenConnections() {
  const {
    connections,
    setConnections,
    activeConnection,
    setActiveConnection,
    setActiveTab,
    showNewConnectionModal,
    setShowNewConnectionModal,
    editingConnection,
    setEditingConnection,
  } = useKawaii();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sidebarView, setSidebarView] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filter connections
  const filtered = useMemo(() => {
    let list = [...connections];

    // Sidebar filter
    if (sidebarView === "favorites") {
      list = list.filter(c => c.favorite);
    } else if (sidebarView === "recent") {
      list = [...list].sort((a, b) => {
        const timeMap = { "min ago": 1, "hour ago": 60, "hours ago": 60, "days ago": 1440 };
        const getMin = (str) => {
          if (!str) return 9999;
          const num = parseInt(str) || 0;
          for (const [key, mult] of Object.entries(timeMap)) {
            if (str.includes(key)) return num * mult;
          }
          return 9999;
        };
        return getMin(a.lastUsed) - getMin(b.lastUsed);
      });
    } else if (sidebarView.startsWith("type:")) {
      const t = sidebarView.replace("type:", "");
      list = list.filter(c => c.type === t);
    } else if (sidebarView.startsWith("folder:")) {
      const f = sidebarView.replace("folder:", "");
      list = list.filter(c => c.folder === f);
    }

    // Toolbar type filter
    if (typeFilter !== "all") {
      list = list.filter(c => c.type === typeFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.database.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q)
      );
    }

    return list;
  }, [connections, sidebarView, typeFilter, search]);

  // Counts
  const favCount = connections.filter(c => c.favorite).length;
  const typeCounts = {};
  connections.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });

  // Get unique folders from connections
  const folders = useMemo(() => {
    const set = new Set();
    connections.forEach(c => { if (c.folder) set.add(c.folder); });
    return [...set].sort();
  }, [connections]);

  const filterTypes = ["all", "mysql", "postgresql", "mongodb", "sqlite"];
  const filterLabels = { all: "All", mysql: "MySQL", postgresql: "PostgreSQL", mongodb: "MongoDB", sqlite: "SQLite" };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const [connectingId, setConnectingId] = useState(null);

  const handleConnect = async (conn) => {
    setConnectingId(conn.id);
    try {
      // Parse host and port from stored host field (e.g. "localhost:5432")
      let host = conn.host || "";
      let port = conn.port || null;
      if (!port && host.includes(":")) {
        const parts = host.split(":");
        host = parts[0];
        port = parts[1];
      }
      const result = await window.akatsuki.kawaiidb.testConnection({
        type: conn.type,
        host,
        port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      });
      if (result.ok) {
        setConnections(prev => prev.map(c =>
          c.id === conn.id ? { ...c, status: "online", lastUsed: "Just now" } : c
        ));
        setActiveConnection({ ...conn, status: "online", lastUsed: "Just now" });
        setActiveTab("navigator");
      } else {
        // Connection failed — update status to offline and show error
        setConnections(prev => prev.map(c =>
          c.id === conn.id ? { ...c, status: "offline" } : c
        ));
        setConnectError({ id: conn.id, msg: result.msg });
      }
    } catch (e) {
      setConnectError({ id: conn.id, msg: e.message || "Connection failed" });
    } finally {
      setConnectingId(null);
    }
  };

  const [connectError, setConnectError] = useState(null);

  const handleDisconnect = (conn) => {
    setConnections(prev => prev.map(c =>
      c.id === conn.id ? { ...c, status: "offline" } : c
    ));
    if (activeConnection?.id === conn.id) {
      setActiveConnection(null);
    }
  };

  const handleEdit = (conn) => {
    setEditingConnection(conn);
    setShowNewConnectionModal(true);
  };

  const handleDelete = (conn) => {
    setDeleteTarget(conn);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setConnections(prev => prev.filter(c => c.id !== deleteTarget.id));
    if (activeConnection?.id === deleteTarget.id) {
      setActiveConnection(null);
    }
    setDeleteTarget(null);
  };

  const handleToggleFavorite = (id) => {
    setConnections(prev => prev.map(c =>
      c.id === id ? { ...c, favorite: !c.favorite } : c
    ));
  };

  const handleSave = (conn) => {
    if (editingConnection) {
      // Update existing
      setConnections(prev => prev.map(c => c.id === conn.id ? conn : c));
      // Update active connection if it's the one being edited
      if (activeConnection?.id === conn.id) {
        setActiveConnection(conn);
      }
    } else {
      // Add new
      setConnections(prev => [...prev, conn]);
    }
    setShowNewConnectionModal(false);
    setEditingConnection(null);
  };

  const handleSaveAndGo = (conn) => {
    if (editingConnection) {
      setConnections(prev => prev.map(c => c.id === conn.id ? conn : c));
    } else {
      setConnections(prev => [...prev, conn]);
    }
    setActiveConnection(conn);
    setShowNewConnectionModal(false);
    setEditingConnection(null);
    setActiveTab("navigator");
  };

  const handleCloseModal = () => {
    setShowNewConnectionModal(false);
    setEditingConnection(null);
  };

  // Sidebar title based on view
  const mainTitle = (() => {
    if (sidebarView === "all") return "ALL CONNECTIONS";
    if (sidebarView === "favorites") return "FAVORITE CONNECTIONS";
    if (sidebarView === "recent") return "RECENT CONNECTIONS";
    if (sidebarView.startsWith("type:")) {
      const t = sidebarView.replace("type:", "");
      return `${(DB_TYPES[t]?.label || t).toUpperCase()} CONNECTIONS`;
    }
    if (sidebarView.startsWith("folder:")) {
      const f = sidebarView.replace("folder:", "");
      return `${f.toUpperCase()}`;
    }
    return "CONNECTIONS";
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg0, fontFamily: T.fontUI }}>

      {/* Toolbar */}
      <div style={{
        height: 44, background: T.bg1, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search connections..."
          style={{
            width: 280, background: T.bg3, border: `1px solid ${T.border2}`,
            borderRadius: 6, color: T.txt, fontSize: 12, fontFamily: T.fontUI,
            padding: "6px 12px", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {filterTypes.map(ft => (
            <FilterPill
              key={ft}
              label={filterLabels[ft]}
              active={typeFilter === ft}
              onClick={() => setTypeFilter(ft)}
            />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left Sidebar */}
        <div style={{
          width: 240, background: T.bg2, borderRight: `1px solid ${T.border}`,
          flexShrink: 0, overflow: "hidden auto", display: "flex", flexDirection: "column",
        }}>
          <PanelHeader title="CONNECTIONS" accent={T.teal} count={connections.length} />

          <div style={{ padding: "6px 0", flex: 1 }}>
            <SidebarRow
              label="All Connections"
              count={connections.length}
              active={sidebarView === "all"}
              onClick={() => setSidebarView("all")}
            />
            <SidebarRow
              label="Favorites"
              icon={"\u2605"}
              count={favCount}
              active={sidebarView === "favorites"}
              onClick={() => setSidebarView("favorites")}
            />
            <SidebarRow
              label="Recent"
              icon={"\u25F7"}
              count={connections.length}
              active={sidebarView === "recent"}
              onClick={() => setSidebarView("recent")}
            />

            <div style={{ height: 1, background: T.border, margin: "8px 12px" }} />

            <div style={{
              fontSize: 10, color: T.txt3, letterSpacing: "0.08em", padding: "4px 14px 6px",
              textTransform: "uppercase", fontWeight: 600, fontFamily: T.fontUI,
            }}>
              BY TYPE
            </div>

            {[
              { key: "mysql", label: "MySQL", color: T.blue },
              { key: "postgresql", label: "PostgreSQL", color: T.green },
              { key: "mongodb", label: "MongoDB", color: T.amber },
              { key: "sqlite", label: "SQLite", color: T.purple },
            ].map(({ key, label, color }) => (
              <SidebarRow
                key={key}
                label={label}
                icon={<Dot color={color} size={8} />}
                count={typeCounts[key] || 0}
                active={sidebarView === `type:${key}`}
                accent={color}
                onClick={() => setSidebarView(`type:${key}`)}
              />
            ))}

            {folders.length > 0 && (
              <>
                <div style={{ height: 1, background: T.border, margin: "8px 12px" }} />
                <div style={{
                  fontSize: 10, color: T.txt3, letterSpacing: "0.08em", padding: "4px 14px 6px",
                  textTransform: "uppercase", fontWeight: 600, fontFamily: T.fontUI,
                }}>
                  FOLDERS
                </div>
                {folders.map(folder => (
                  <SidebarRow
                    key={folder}
                    label={folder}
                    icon={"\uD83D\uDCC1"}
                    active={sidebarView === `folder:${folder}`}
                    onClick={() => setSidebarView(`folder:${folder}`)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflow: "hidden auto", background: T.bg0 }}>
          <PanelHeader title={mainTitle} accent={T.teal}>
            <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI }}>
              {filtered.length} connection{filtered.length !== 1 ? "s" : ""}
            </span>
          </PanelHeader>

          {/* Card Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
            padding: "16px 20px 24px",
          }}>
            {filtered.map(conn => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                isActive={activeConnection?.id === conn.id}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                connecting={connectingId === conn.id}
                error={connectError?.id === conn.id ? connectError.msg : null}
              />
            ))}

            {filtered.length === 0 && (
              <div style={{
                gridColumn: "1 / -1", textAlign: "center", padding: "60px 0",
              }}>
                {connections.length === 0 ? (
                  <>
                    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12, opacity: 0.4 }}>
                      <path d="M12 2C6.48 2 2 4.69 2 8v8c0 3.31 4.48 6 10 6s10-2.69 10-6V8c0-3.31-4.48-6-10-6z" stroke={T.txt3} strokeWidth={1.5} fill="none" />
                      <ellipse cx={12} cy={8} rx={10} ry={4} stroke={T.txt3} strokeWidth={1.5} fill="none" />
                    </svg>
                    <div style={{ fontSize: 14, color: T.txt2, marginBottom: 4 }}>No connections yet</div>
                    <div style={{ fontSize: 12, color: T.txt3, marginBottom: 16 }}>Create your first database connection to get started</div>
                    <Btn
                      variant="primary"
                      onClick={() => setShowNewConnectionModal(true)}
                      style={{ background: T.teal, color: T.bg0 }}
                    >
                      + New Connection
                    </Btn>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>
                      {"\uD83D\uDD0D"}
                    </div>
                    <div style={{ fontSize: 14, color: T.txt2, marginBottom: 4 }}>No connections found</div>
                    <div style={{ fontSize: 12, color: T.txt3 }}>Try adjusting your search or filters</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New/Edit Connection Modal */}
      {showNewConnectionModal && (
        <ConnectionModal
          editConn={editingConnection}
          onClose={handleCloseModal}
          onSave={handleSave}
          onSaveAndGo={handleSaveAndGo}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirm
          conn={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

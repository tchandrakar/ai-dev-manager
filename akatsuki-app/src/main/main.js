const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");

// ── Memory Agent (inlined to avoid Vite module resolution issues) ─────────────
let _db = null;

function memInit(workingDir) {
  try {
    const Database = require("better-sqlite3");
    const memDir = path.join(workingDir, "memory");
    fs.mkdirSync(path.join(memDir, "embeddings"), { recursive: true });
    fs.mkdirSync(path.join(memDir, "author-profiles"), { recursive: true });
    fs.mkdirSync(path.join(memDir, "repo-profiles"), { recursive: true });
    _db = new Database(path.join(memDir, "index.db"));
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY, repo_slug TEXT NOT NULL, pr_number INTEGER,
        pr_title TEXT, author TEXT, branch TEXT, risk_score REAL,
        model TEXT, token_count INTEGER, outcome TEXT DEFAULT 'pending',
        signal_weight REAL DEFAULT 0.5, review_text TEXT, created_at TEXT NOT NULL,
        pr_url TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id),
        repo_slug TEXT NOT NULL, file_path TEXT, line_start INTEGER, line_end INTEGER,
        severity TEXT, category TEXT, description TEXT, suggestion TEXT,
        signal_weight REAL DEFAULT 0.5
      );
      CREATE TABLE IF NOT EXISTS file_stats (
        repo_slug TEXT NOT NULL, file_path TEXT NOT NULL,
        flag_count INTEGER DEFAULT 0, last_flagged TEXT,
        PRIMARY KEY (repo_slug, file_path)
      );
      CREATE INDEX IF NOT EXISTS idx_findings_repo_file ON findings(repo_slug, file_path);
      CREATE INDEX IF NOT EXISTS idx_reviews_repo ON reviews(repo_slug);
    `);
    // Migrations for existing DBs — silently ignore if column already exists
    for (const col of [
      "ALTER TABLE reviews ADD COLUMN pr_url TEXT DEFAULT ''",
      "ALTER TABLE findings ADD COLUMN suggestion TEXT DEFAULT ''",
    ]) { try { _db.exec(col); } catch {} }
    return { ok: true };
  } catch (e) { return { error: e.message }; }
}

function memSaveReview({ repoSlug, prNumber, prTitle, author, branch, riskScore, model, tokenCount, reviewText, findings, prUrl }) {
  if (!_db) return { error: "Memory not initialized" };
  const id = crypto.createHash("sha256").update(`${repoSlug}-${prNumber}-${Date.now()}`).digest("hex").slice(0, 16);
  const now = new Date().toISOString();
  _db.prepare(`INSERT INTO reviews (id,repo_slug,pr_number,pr_title,author,branch,risk_score,model,token_count,review_text,created_at,pr_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, repoSlug, prNumber, prTitle, author, branch, riskScore, model, tokenCount, reviewText, now, prUrl || "");
  if (findings && findings.length > 0) {
    const ins = _db.prepare(`INSERT INTO findings (id,review_id,repo_slug,file_path,line_start,line_end,severity,category,description,suggestion) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const upd = _db.prepare(`INSERT INTO file_stats(repo_slug,file_path,flag_count,last_flagged) VALUES(?,?,1,?) ON CONFLICT(repo_slug,file_path) DO UPDATE SET flag_count=flag_count+1,last_flagged=excluded.last_flagged`);
    for (const f of findings) {
      ins.run(crypto.randomUUID().slice(0,16), id, repoSlug, f.filePath||"", f.lineStart||0, f.lineEnd||0, f.severity, f.category, f.description, f.suggestion||"");
      if (f.filePath) upd.run(repoSlug, f.filePath, now);
    }
  }
  return { id };
}

function memGetReviewDetail(reviewId) {
  if (!_db) return { error: "Memory not initialized" };
  try {
    const review = _db.prepare(`SELECT * FROM reviews WHERE id=?`).get(reviewId);
    if (!review) return { error: "Review not found" };
    const findings = _db.prepare(`SELECT * FROM findings WHERE review_id=? ORDER BY file_path,line_start`).all(reviewId);
    return { review, findings };
  } catch (e) { return { error: e.message }; }
}

function memArchiveReviews(ids) {
  if (!_db || !ids?.length) return { ok: true, count: 0 };
  try {
    const ph = ids.map(() => "?").join(",");
    _db.prepare(`UPDATE reviews SET outcome='archived', signal_weight=0 WHERE id IN (${ph})`).run(...ids);
    return { ok: true, count: ids.length };
  } catch (e) { return { error: e.message }; }
}

function memUpdateOutcome(reviewId, outcome) {
  if (!_db) return { error: "Memory not initialized" };
  const w = { posted:1.0, modified:0.7, discarded:0.2, pending:0.5 }[outcome] ?? 0.5;
  _db.prepare(`UPDATE reviews SET outcome=?,signal_weight=? WHERE id=?`).run(outcome, w, reviewId);
  _db.prepare(`UPDATE findings SET signal_weight=? WHERE review_id=?`).run(w, reviewId);
  return { ok: true };
}

function memQueryContext({ repoSlug, author, filePaths = [] }) {
  if (!_db) return { repoSlug, totalReviews: 0 };
  let fileHistory = [];
  if (filePaths.length > 0) {
    const ph = filePaths.map(() => "?").join(",");
    fileHistory = _db.prepare(`SELECT f.file_path,f.severity,f.category,f.description,f.signal_weight,r.pr_title,r.pr_number,r.outcome,r.created_at FROM findings f JOIN reviews r ON r.id=f.review_id WHERE f.repo_slug=? AND f.file_path IN (${ph}) ORDER BY f.signal_weight DESC,r.created_at DESC LIMIT 20`).all(repoSlug, ...filePaths);
  }
  const recent = _db.prepare(`SELECT risk_score FROM reviews WHERE repo_slug=? ORDER BY created_at DESC LIMIT 20`).all(repoSlug);
  const avgRisk = recent.length ? (recent.reduce((s,r) => s+(r.risk_score||0),0)/recent.length).toFixed(1) : null;
  const topPatterns = _db.prepare(`SELECT category,COUNT(*) as cnt,AVG(signal_weight) as avg_weight FROM findings WHERE repo_slug=? GROUP BY category ORDER BY avg_weight DESC,cnt DESC LIMIT 5`).all(repoSlug);
  let authorProfile = null;
  if (author) {
    const ar = _db.prepare(`SELECT risk_score FROM reviews WHERE repo_slug=? AND author=? ORDER BY created_at DESC LIMIT 10`).all(repoSlug, author);
    const ap = _db.prepare(`SELECT f.category,COUNT(*) as cnt FROM findings f JOIN reviews r ON r.id=f.review_id WHERE r.repo_slug=? AND r.author=? GROUP BY f.category ORDER BY cnt DESC LIMIT 3`).all(repoSlug, author);
    authorProfile = { totalPRs: ar.length, avgRisk: ar.length ? (ar.reduce((s,r)=>s+(r.risk_score||0),0)/ar.length).toFixed(1) : null, commonPatterns: ap };
  }
  const flaggedFiles = filePaths.length > 0 ? _db.prepare(`SELECT file_path,flag_count,last_flagged FROM file_stats WHERE repo_slug=? AND file_path IN (${filePaths.map(()=>"?").join(",")}) ORDER BY flag_count DESC`).all(repoSlug, ...filePaths) : [];
  return { repoSlug, totalReviews: recent.length, avgRisk, topPatterns, fileHistory, flaggedFiles, authorProfile };
}

function memBuildContextBlock(ctx) {
  if (!ctx || ctx.totalReviews === 0) return "";
  const lines = ["--- SHARINGAN MEMORY CONTEXT ---","",`REPO: ${ctx.repoSlug}`];
  if (ctx.avgRisk) lines.push(`Avg Risk: ${ctx.avgRisk}/10 | Total Reviews: ${ctx.totalReviews}`);
  if (ctx.topPatterns?.length > 0) { lines.push("","TOP RECURRING ISSUES:"); for (const p of ctx.topPatterns) lines.push(`  • ${p.category} (${p.cnt}x, ${p.avg_weight>0.7?"high":"medium"} signal)`); }
  if (ctx.authorProfile?.totalPRs > 0) { lines.push("","AUTHOR HISTORY:"); lines.push(`  Past PRs: ${ctx.authorProfile.totalPRs} | Avg risk: ${ctx.authorProfile.avgRisk}/10`); if (ctx.authorProfile.commonPatterns?.length > 0) lines.push(`  Patterns: ${ctx.authorProfile.commonPatterns.map(p=>`${p.category}(${p.cnt}x)`).join(", ")}`); }
  if (ctx.fileHistory?.length > 0) {
    lines.push("","FILE HISTORY:");
    const g = {};
    for (const h of ctx.fileHistory.slice(0,10)) (g[h.file_path]=g[h.file_path]||[]).push(h);
    for (const [fp,items] of Object.entries(g).slice(0,3)) { lines.push(`  ${fp}:`); for (const i of items.slice(0,2)) lines.push(`    • ${i.created_at?.slice(0,10)}: "${i.description}" [${i.severity}, ${i.outcome}]`); }
  }
  lines.push("","--- END MEMORY CONTEXT ---");
  return lines.join("\n");
}

function memGetStats(workingDir) {
  try {
    const n = _db ? _db.prepare("SELECT COUNT(*) as n FROM reviews").get().n : 0;
    let sizeBytes = 0;
    const dbPath = path.join(workingDir, "memory", "index.db");
    if (fs.existsSync(dbPath)) sizeBytes = fs.statSync(dbPath).size;
    const last = _db ? _db.prepare("SELECT created_at FROM reviews ORDER BY created_at DESC LIMIT 1").get() : null;
    return { reviewCount: n, sizeBytes, lastReview: last?.created_at ?? null };
  } catch { return { reviewCount: 0, sizeBytes: 0, lastReview: null }; }
}

function memClearAll(workingDir) {
  try {
    if (_db) _db.exec("DELETE FROM findings; DELETE FROM file_stats; DELETE FROM reviews;");
    const embDir = path.join(workingDir, "memory", "embeddings");
    if (fs.existsSync(embDir)) for (const f of fs.readdirSync(embDir)) fs.unlinkSync(path.join(embDir, f));
    return { ok: true };
  } catch (e) { return { error: e.message }; }
}

function memListReviews({ limit = 100, offset = 0, showArchived = false } = {}) {
  if (!_db) return { reviews: [] };
  try {
    const where = showArchived ? "" : "WHERE outcome != 'archived'";
    const rows = _db.prepare(
      `SELECT id, repo_slug, pr_number, pr_title, author, branch, risk_score, model, outcome, created_at, pr_url
       FROM reviews ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset);
    return { reviews: rows };
  } catch (e) { return { reviews: [], error: e.message }; }
}

function memClose() { if (_db) { try { _db.close(); } catch {} _db = null; } }

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), ".akatsuki", "config.json");
function loadConfig() {
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch {}
  return {};
}
function saveConfig(cfg) {
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); return { ok: true }; }
  catch (e) { return { error: e.message }; }
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: "#070B14",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) { mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL); }
  else { mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)); }
}

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (cfg.workingDir && fs.existsSync(cfg.workingDir)) memInit(cfg.workingDir);
  createWindow();
});
app.on("window-all-closed", () => { memClose(); if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("config:load", () => loadConfig());
ipcMain.handle("config:save", (_, cfg) => saveConfig(cfg));

ipcMain.handle("workdir:select", async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory","createDirectory"], title: "Select Working Directory", buttonLabel: "Select Directory" });
  return r.canceled || !r.filePaths.length ? { canceled: true } : { path: r.filePaths[0] };
});
ipcMain.handle("workdir:init", (_, dir) => {
  try { for (const d of ["reviews","config","cache/diffs","memory/embeddings","memory/author-profiles","memory/repo-profiles"]) fs.mkdirSync(path.join(dir, d), { recursive: true }); return memInit(dir); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle("workdir:open", (_, dir) => { shell.openPath(dir); return { ok: true }; });
ipcMain.handle("shell:open-external", (_, url) => { shell.openExternal(url); return { ok: true }; });
ipcMain.handle("workdir:stats", (_, dir) => memGetStats(dir));
ipcMain.handle("workdir:clear", (_, dir) => memClearAll(dir));

// ── KawaiiDB persistent connection pool ──────────────────────────────────────
const _dbPools = new Map(); // connectionId -> { type, client, meta }
const _sshTunnels = new Map(); // connectionId -> { sshClient, server, localPort }

// ── SSH Tunnel helper (key / agent mode) ─────────────────────────────────────
function _createSSHTunnel({ sshHost, sshPort, sshUser, sshKey, targetHost, targetPort }) {
  const { Client: SSHClient } = require("ssh2");
  const net = require("net");
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    const timeout = setTimeout(() => { ssh.destroy(); reject(new Error("SSH tunnel timed out")); }, 15000);

    ssh.on("ready", () => {
      // SSH connected — now start local TCP server that forwards to remote target
      const server = net.createServer((sock) => {
        ssh.forwardOut("127.0.0.1", sock.localPort, targetHost || "127.0.0.1", targetPort, (err, stream) => {
          if (err) { sock.destroy(); return; }
          sock.pipe(stream).pipe(sock);
          sock.on("error", () => stream.destroy());
          stream.on("error", () => sock.destroy());
        });
      });
      server.listen(0, "127.0.0.1", () => {
        clearTimeout(timeout);
        resolve({ sshClient: ssh, server, localPort: server.address().port });
      });
      server.on("error", (err) => { clearTimeout(timeout); ssh.destroy(); reject(err); });
    });

    ssh.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`SSH: ${err.message}`));
    });

    // Build SSH connect options
    const sshOpts = {
      host: sshHost,
      port: parseInt(sshPort, 10) || 22,
      username: sshUser || os.userInfo().username,
      readyTimeout: 12000,
    };
    const keyPath = (sshKey || "").replace(/^~/, os.homedir());
    if (keyPath && fs.existsSync(keyPath)) {
      sshOpts.privateKey = fs.readFileSync(keyPath);
    } else {
      sshOpts.agent = process.env.SSH_AUTH_SOCK;
    }
    ssh.connect(sshOpts);
  });
}

// ── SSH Tunnel helper (custom command mode, e.g. gcloud compute ssh) ─────────
function _createCommandTunnel(command) {
  const { spawn } = require("child_process");
  const net = require("net");

  // Parse -L localPort:host:remotePort from the command
  const lMatch = command.match(/-L\s+(\d+):([^:]+):(\d+)/);
  if (!lMatch) return Promise.reject(new Error("Could not find -L <localPort>:<host>:<remotePort> in the command"));

  const localPort = parseInt(lMatch[1], 10);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch {}
      reject(new Error("Tunnel command timed out waiting for port to become ready"));
    }, 30000);

    // Use login shell to inherit user's full PATH (macOS Electron apps don't get /opt/homebrew/bin etc.)
    const userShell = process.env.SHELL || "/bin/zsh";
    const proc = spawn(userShell, ["-l", "-c", command], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      detached: false,
    });
    proc.stdin.end();

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => { clearTimeout(timeout); reject(new Error(`Tunnel command failed: ${err.message}`)); });
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) reject(new Error(`Tunnel command exited with code ${code}: ${stderr.slice(0, 200)}`));
    });

    // Wait for the local port to become reachable
    const checkPort = () => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on("connect", () => {
        sock.destroy();
        clearTimeout(timeout);
        resolve({ process: proc, localPort });
      });
      sock.on("error", () => { sock.destroy(); setTimeout(checkPort, 500); });
      sock.on("timeout", () => { sock.destroy(); setTimeout(checkPort, 500); });
      sock.connect(localPort, "127.0.0.1");
    };
    // Give the command a moment to start before checking
    setTimeout(checkPort, 1000);
  });
}

function _destroySSHTunnel(id) {
  const t = _sshTunnels.get(id);
  if (!t) return;
  if (t.process) {
    try { t.process.kill(); } catch {}
  } else {
    try { t.server.close(); } catch {}
    try { t.sshClient.destroy(); } catch {}
  }
  _sshTunnels.delete(id);
}

function _dbQuoteId(type, name) {
  if (type === "mysql" || type === "mariadb") return "`" + name.replace(/`/g, "``") + "`";
  return '"' + name.replace(/"/g, '""') + '"';
}

// ── KawaiiDB connection test ──────────────────────────────────────────────────
ipcMain.handle("kawaiidb:test-connection", async (_, { type, host, port, database, username, password, sshEnabled, sshMode, sshHost, sshPort, sshUser, sshKey, sshCommand }) => {
  let h = (host || "localhost").trim();
  let p = parseInt(port, 10) || 0;
  const db = (database || "").trim();
  const user = (username || "").trim();
  const pass = password || "";
  const TIMEOUT = 20000;

  // ── SSH Tunnel (for test, create temporary tunnel) ─────────────────────────
  let tempTunnel = null;
  if (sshEnabled) {
    const defaultPort = { postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017, redis: 6379, sqlserver: 1433, oracle: 1521 }[type] || p;
    try {
      if (sshMode === "command" && sshCommand) {
        tempTunnel = await _createCommandTunnel(sshCommand);
      } else if (sshHost) {
        tempTunnel = await _createSSHTunnel({
          sshHost, sshPort: sshPort || "22", sshUser, sshKey,
          targetHost: h, targetPort: p || defaultPort,
        });
      }
      if (tempTunnel) {
        h = "127.0.0.1";
        p = tempTunnel.localPort;
      }
    } catch (e) {
      return { ok: false, msg: `SSH tunnel failed: ${e.message}` };
    }
  }

  try {

  // ── SQLite ──────────────────────────────────────────────────────────────────
  if (type === "sqlite") {
    const dbPath = (h || db || "").replace(/^~/, os.homedir());
    try {
      if (fs.existsSync(dbPath)) return { ok: true, msg: "SQLite file found and accessible" };
      return { ok: false, msg: `File not found: ${dbPath}` };
    } catch (e) { return { ok: false, msg: e.message }; }
  }

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  if (type === "postgresql") {
    const { Client } = require("pg");
    const client = new Client({
      host: h, port: p || 5432,
      database: db || "postgres",
      user: user || "postgres",
      password: pass,
      connectionTimeoutMillis: TIMEOUT,
      ssl: false,
    });
    try {
      await client.connect();
      const res = await client.query("SELECT version()");
      await client.end();
      const ver = res.rows[0]?.version?.split(" ").slice(0, 2).join(" ") || "PostgreSQL";
      return { ok: true, msg: `Connected — ${ver}` };
    } catch (e) {
      try { await client.end(); } catch {}
      return { ok: false, msg: e.message };
    }
  }

  // ── MySQL / MariaDB ─────────────────────────────────────────────────────────
  if (type === "mysql" || type === "mariadb") {
    const mysql = require("mysql2/promise");
    let conn;
    try {
      conn = await mysql.createConnection({
        host: h, port: p || 3306,
        database: db || undefined,
        user: user || "root",
        password: pass,
        connectTimeout: TIMEOUT,
      });
      const [[row]] = await conn.query("SELECT VERSION() as v");
      await conn.end();
      return { ok: true, msg: `Connected — ${type === "mariadb" ? "MariaDB" : "MySQL"} ${row.v}` };
    } catch (e) {
      try { if (conn) await conn.end(); } catch {}
      return { ok: false, msg: e.message };
    }
  }

  // ── MongoDB ─────────────────────────────────────────────────────────────────
  if (type === "mongodb") {
    const { MongoClient } = require("mongodb");
    const uri = user
      ? `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${h}:${p || 27017}/${db}`
      : `mongodb://${h}:${p || 27017}/${db}`;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: TIMEOUT, connectTimeoutMS: TIMEOUT });
    try {
      await client.connect();
      const info = await client.db("admin").command({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 });
      await client.close();
      return { ok: true, msg: `Connected — MongoDB ${info.version}` };
    } catch (e) {
      try { await client.close(); } catch {}
      return { ok: false, msg: e.message };
    }
  }

  // ── Redis ───────────────────────────────────────────────────────────────────
  if (type === "redis") {
    const Redis = require("ioredis");
    const client = new Redis({
      host: h, port: p || 6379,
      username: user || undefined,
      password: pass || undefined,
      db: parseInt(db, 10) || 0,
      connectTimeout: TIMEOUT,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      const info = await client.info("server");
      const verMatch = info.match(/redis_version:([\d.]+)/);
      await client.quit();
      return { ok: true, msg: `Connected — Redis ${verMatch ? verMatch[1] : ""} (${pong})` };
    } catch (e) {
      try { client.disconnect(); } catch {}
      return { ok: false, msg: e.message };
    }
  }

  // ── SQL Server (MSSQL) ──────────────────────────────────────────────────────
  if (type === "sqlserver") {
    const mssql = require("mssql");
    const cfg = {
      server: h,
      port: p || 1433,
      database: db || "master",
      user: user || "sa",
      password: pass,
      options: { trustServerCertificate: true, connectTimeout: TIMEOUT },
    };
    let pool;
    try {
      pool = await mssql.connect(cfg);
      const res = await pool.request().query("SELECT @@VERSION AS v");
      const ver = res.recordset[0]?.v?.split("\n")[0] || "SQL Server";
      await pool.close();
      return { ok: true, msg: `Connected — ${ver}` };
    } catch (e) {
      try { if (pool) await pool.close(); } catch {}
      mssql.close();
      return { ok: false, msg: e.message };
    }
  }

  // ── Oracle ──────────────────────────────────────────────────────────────────
  if (type === "oracle") {
    // oracledb requires thick-mode native libs; attempt dynamic require
    try {
      const oracledb = require("oracledb");
      let conn;
      try {
        conn = await oracledb.getConnection({
          user: user || "system",
          password: pass,
          connectString: `${h}:${p || 1521}/${db || "ORCL"}`,
          connectTimeout: Math.floor(TIMEOUT / 1000),
        });
        const res = await conn.execute("SELECT banner FROM v$version WHERE ROWNUM = 1");
        const ver = res.rows?.[0]?.[0] || "Oracle DB";
        await conn.close();
        return { ok: true, msg: `Connected — ${ver}` };
      } catch (e) {
        try { if (conn) await conn.close(); } catch {}
        return { ok: false, msg: e.message };
      }
    } catch {
      // oracledb not installed — fall back to TCP ping
    }
  }

  // ── Generic TCP fallback (Oracle without driver, or unknown types) ──────────
  const net = require("net");
  if (!h || !p) return { ok: false, msg: "Host and port are required" };
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const done = (r) => { if (resolved) return; resolved = true; socket.destroy(); resolve(r); };
    socket.setTimeout(TIMEOUT);
    socket.on("connect", () => done({ ok: true, msg: `TCP port ${p} reachable on ${h}` }));
    socket.on("timeout", () => done({ ok: false, msg: `Timed out connecting to ${h}:${p}` }));
    socket.on("error", (err) => {
      const msgs = { ECONNREFUSED: `Connection refused at ${h}:${p}`, ENOTFOUND: `Host not found: ${h}`, EHOSTUNREACH: `Host unreachable: ${h}` };
      done({ ok: false, msg: msgs[err.code] || err.message });
    });
    socket.connect(p, h);
  });

  } finally {
    // Clean up temporary SSH tunnel after test
    if (tempTunnel) {
      if (tempTunnel.process) {
        try { tempTunnel.process.kill(); } catch {}
      } else {
        try { tempTunnel.server.close(); } catch {}
        try { tempTunnel.sshClient.destroy(); } catch {}
      }
    }
  }
});

// ── KawaiiDB: persistent connect ──────────────────────────────────────────────
ipcMain.handle("kawaiidb:connect", async (_, { id, type, host, port, database, username, password, sshEnabled, sshMode, sshHost, sshPort, sshUser, sshKey, sshCommand }) => {
  let h = (host || "localhost").trim();
  let p = parseInt(port, 10) || 0;
  const db = (database || "").trim();
  const user = (username || "").trim();
  const pass = password || "";
  const TIMEOUT = 20000;

  // Close existing connection & SSH tunnel if any
  _destroySSHTunnel(id);
  if (_dbPools.has(id)) {
    try {
      const old = _dbPools.get(id);
      if (old.type === "sqlite") old.client.close();
      else if (old.type === "mongodb") await old.client.close();
      else if (old.type === "redis") old.client.disconnect();
      else if (old.client.end) await old.client.end();
      else if (old.client.close) await old.client.close();
    } catch {}
    _dbPools.delete(id);
  }

  // ── SSH Tunnel (persistent, stored for cleanup on disconnect) ──────────────
  if (sshEnabled) {
    const defaultPort = { postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017, redis: 6379, sqlserver: 1433, oracle: 1521 }[type] || p;
    try {
      let tunnel;
      if (sshMode === "command" && sshCommand) {
        tunnel = await _createCommandTunnel(sshCommand);
      } else if (sshHost) {
        tunnel = await _createSSHTunnel({
          sshHost, sshPort: sshPort || "22", sshUser, sshKey,
          targetHost: h, targetPort: p || defaultPort,
        });
      }
      if (tunnel) {
        _sshTunnels.set(id, tunnel);
        h = "127.0.0.1";
        p = tunnel.localPort;
      }
    } catch (e) {
      return { ok: false, msg: `SSH tunnel failed: ${e.message}` };
    }
  }

  try {
    if (type === "sqlite") {
      const dbPath = (h || db || "").replace(/^~/, os.homedir());
      const Database = require("better-sqlite3");
      const client = new Database(dbPath);
      client.pragma("journal_mode = WAL");
      const ver = client.prepare("SELECT sqlite_version() AS v").get();
      _dbPools.set(id, { type, client, meta: { version: `SQLite ${ver.v}`, database: path.basename(dbPath) } });
      return { ok: true, version: `SQLite ${ver.v}` };
    }

    if (type === "postgresql") {
      const { Pool } = require("pg");
      const pool = new Pool({
        host: h, port: p || 5432,
        database: db || "postgres",
        user: user || "postgres",
        password: pass,
        connectionTimeoutMillis: TIMEOUT,
        idleTimeoutMillis: 0,        // never reap idle clients
        keepAlive: true,              // TCP keepalive on sockets
        keepAliveInitialDelayMillis: 10000,
        max: 5,
        ssl: false,
      });
      const res = await pool.query("SELECT version()");
      const ver = res.rows[0]?.version?.split(" ").slice(0, 2).join(" ") || "PostgreSQL";
      _dbPools.set(id, { type, client: pool, meta: { version: ver, database: db || "postgres" } });
      return { ok: true, version: ver };
    }

    if (type === "mysql" || type === "mariadb") {
      const mysql = require("mysql2/promise");
      const pool = await mysql.createPool({
        host: h, port: p || 3306,
        database: db || undefined,
        user: user || "root",
        password: pass,
        connectTimeout: TIMEOUT,
        connectionLimit: 5,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      const [[row]] = await pool.query("SELECT VERSION() as v");
      const ver = `${type === "mariadb" ? "MariaDB" : "MySQL"} ${row.v}`;
      _dbPools.set(id, { type, client: pool, meta: { version: ver, database: db } });
      return { ok: true, version: ver };
    }

    if (type === "mongodb") {
      const { MongoClient } = require("mongodb");
      const uri = user
        ? `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${h}:${p || 27017}/${db}`
        : `mongodb://${h}:${p || 27017}/${db}`;
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: TIMEOUT, connectTimeoutMS: TIMEOUT });
      await client.connect();
      const info = await client.db("admin").command({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 });
      const ver = `MongoDB ${info.version}`;
      _dbPools.set(id, { type, client, meta: { version: ver, database: db || "test" } });
      return { ok: true, version: ver };
    }

    if (type === "redis") {
      const Redis = require("ioredis");
      const client = new Redis({
        host: h, port: p || 6379,
        username: user || undefined,
        password: pass || undefined,
        db: parseInt(db, 10) || 0,
        connectTimeout: TIMEOUT,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await client.connect();
      const info = await client.info("server");
      const verMatch = info.match(/redis_version:([\d.]+)/);
      const ver = `Redis ${verMatch ? verMatch[1] : ""}`;
      _dbPools.set(id, { type, client, meta: { version: ver, database: db || "0" } });
      return { ok: true, version: ver };
    }

    if (type === "sqlserver") {
      const mssql = require("mssql");
      const cfg = {
        server: h, port: p || 1433,
        database: db || "master",
        user: user || "sa",
        password: pass,
        options: { trustServerCertificate: true, connectTimeout: TIMEOUT },
      };
      const pool = await mssql.connect(cfg);
      const res = await pool.request().query("SELECT @@VERSION AS v");
      const ver = res.recordset[0]?.v?.split("\n")[0] || "SQL Server";
      _dbPools.set(id, { type: "sqlserver", client: pool, meta: { version: ver, database: db || "master" } });
      return { ok: true, version: ver };
    }

    return { ok: false, msg: `Unsupported database type: ${type}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// ── KawaiiDB: disconnect ────────────────────────────────────────────────────
ipcMain.handle("kawaiidb:disconnect", async (_, { id }) => {
  if (!_dbPools.has(id) && !_sshTunnels.has(id)) return { ok: true };
  try {
    const entry = _dbPools.get(id);
    if (entry) {
      if (entry.type === "sqlite") entry.client.close();
      else if (entry.type === "mongodb") await entry.client.close();
      else if (entry.type === "redis") entry.client.disconnect();
      else if (entry.client.end) await entry.client.end();
      else if (entry.client.close) await entry.client.close();
    }
  } catch {}
  _dbPools.delete(id);
  _destroySSHTunnel(id);
  return { ok: true };
});

// ── KawaiiDB: execute query ─────────────────────────────────────────────────
ipcMain.handle("kawaiidb:execute-query", async (_, { connectionId, sql }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { error: "No active connection. Please connect first.", duration: 0 };

  const start = process.hrtime.bigint();

  try {
    if (entry.type === "postgresql") {
      const res = await entry.client.query(sql);
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      if (res.rows && res.fields) {
        const columns = res.fields.map((f) => f.name);
        const rows = res.rows.map((r) => {
          const obj = {};
          for (const col of columns) {
            let v = r[col];
            if (v instanceof Date) v = v.toISOString();
            else if (Buffer.isBuffer(v)) v = `<binary ${v.length}B>`;
            else if (typeof v === "bigint") v = v.toString();
            obj[col] = v;
          }
          return obj;
        });
        return { columns, rows, rowCount: res.rowCount, duration: Math.round(duration) };
      }
      return { columns: [], rows: [], rowCount: res.rowCount || 0, duration: Math.round(duration), message: `${res.command || "OK"}: ${res.rowCount ?? 0} rows affected` };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const [result, fields] = await entry.client.query(sql);
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      if (Array.isArray(result) && fields) {
        const columns = fields.map((f) => f.name);
        const rows = result.map((r) => {
          const obj = {};
          for (const col of columns) {
            let v = r[col];
            if (v instanceof Date) v = v.toISOString();
            else if (Buffer.isBuffer(v)) v = `<binary ${v.length}B>`;
            obj[col] = v;
          }
          return obj;
        });
        return { columns, rows, rowCount: result.length, duration: Math.round(duration) };
      }
      return { columns: [], rows: [], rowCount: result.affectedRows || 0, duration: Math.round(duration), message: `${result.affectedRows ?? 0} rows affected` };
    }

    if (entry.type === "sqlite") {
      const trimmed = sql.trim();
      const upper = trimmed.toUpperCase();
      const duration_fn = () => Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA") || upper.startsWith("EXPLAIN") || upper.startsWith("WITH")) {
        const stmt = entry.client.prepare(trimmed);
        const rows = stmt.all();
        const columns = rows.length > 0 ? Object.keys(rows[0]) : (stmt.columns ? stmt.columns().map((c) => c.name) : []);
        return { columns, rows, rowCount: rows.length, duration: duration_fn() };
      }
      const info = entry.client.prepare(trimmed).run();
      return { columns: [], rows: [], rowCount: info.changes, duration: duration_fn(), message: `${info.changes} rows affected` };
    }

    if (entry.type === "mongodb") {
      // Basic command execution for MongoDB
      const duration_fn = () => Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const dbName = entry.meta.database || "test";
      const mdb = entry.client.db(dbName);
      // Support simple "db.collection.find()" patterns or raw commands
      const trimmed = sql.trim();
      // Try to parse as JSON command
      try {
        const cmd = JSON.parse(trimmed);
        const result = await mdb.command(cmd);
        return { columns: Object.keys(result), rows: [result], rowCount: 1, duration: duration_fn() };
      } catch {
        // Try find-style: collection_name or db.collection.find()
        const findMatch = trimmed.match(/^(?:db\.)?(\w+)\.find\((.*?)\)$/i);
        if (findMatch) {
          const colName = findMatch[1];
          const filter = findMatch[2] ? JSON.parse(findMatch[2] || "{}") : {};
          const docs = await mdb.collection(colName).find(filter).limit(100).toArray();
          const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
          const rows = docs.map((d) => { const obj = {}; for (const k of columns) { obj[k] = typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k]; } return obj; });
          return { columns, rows, rowCount: docs.length, duration: duration_fn() };
        }
        return { error: `MongoDB: Use JSON commands like {"ping":1} or collection.find() syntax`, duration: duration_fn() };
      }
    }

    if (entry.type === "redis") {
      const duration_fn = () => Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const parts = sql.trim().split(/\s+/);
      const cmd = parts[0].toUpperCase();
      const args = parts.slice(1);
      const result = await entry.client.call(cmd, ...args);
      if (Array.isArray(result)) {
        const rows = result.map((v, i) => ({ index: i, value: typeof v === "object" ? JSON.stringify(v) : String(v) }));
        return { columns: ["index", "value"], rows, rowCount: rows.length, duration: duration_fn() };
      }
      return { columns: ["result"], rows: [{ result: typeof result === "object" ? JSON.stringify(result) : String(result) }], rowCount: 1, duration: duration_fn() };
    }

    if (entry.type === "sqlserver") {
      const res = await entry.client.request().query(sql);
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      if (res.recordset && res.recordset.length > 0) {
        const columns = Object.keys(res.recordset[0]);
        return { columns, rows: res.recordset, rowCount: res.recordset.length, duration: Math.round(duration) };
      }
      return { columns: [], rows: [], rowCount: res.rowsAffected?.[0] || 0, duration: Math.round(duration), message: `${res.rowsAffected?.[0] || 0} rows affected` };
    }

    return { error: `Unsupported DB type: ${entry.type}`, duration: 0 };
  } catch (e) {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    return { error: e.message, duration: Math.round(duration) };
  }
});

// ── KawaiiDB: fetch schema ──────────────────────────────────────────────────
ipcMain.handle("kawaiidb:fetch-schema", async (_, { connectionId }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { error: "No active connection" };

  try {
    if (entry.type === "postgresql") {
      const pool = entry.client;
      // Tables
      const tblRes = await pool.query(`
        SELECT c.relname AS name, c.reltuples::bigint AS row_count
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
      `);
      const tables = [];
      for (const tbl of tblRes.rows) {
        // Columns
        const colRes = await pool.query(`
          SELECT c.column_name AS name, c.data_type AS type, c.is_nullable,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.column_name FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
          ) pk ON pk.column_name = c.column_name
          WHERE c.table_schema = 'public' AND c.table_name = $1
          ORDER BY c.ordinal_position
        `, [tbl.name]);
        // FKs
        const fkRes = await pool.query(`
          SELECT kcu.column_name, ccu.table_name AS fk_table, ccu.column_name AS fk_column
          FROM information_schema.key_column_usage kcu
          JOIN information_schema.referential_constraints rc ON rc.constraint_name = kcu.constraint_name AND rc.constraint_schema = kcu.constraint_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
          WHERE kcu.table_schema = 'public' AND kcu.table_name = $1
        `, [tbl.name]);
        const fkMap = {};
        for (const fk of fkRes.rows) fkMap[fk.column_name] = { fkTable: fk.fk_table, fkColumn: fk.fk_column };

        const columns = colRes.rows.map((c) => ({
          name: c.name, type: c.type.toUpperCase(), pk: c.pk,
          ...(fkMap[c.name] ? { fk: true, fkTable: fkMap[c.name].fkTable, fkColumn: fkMap[c.name].fkColumn } : {}),
        }));
        tables.push({ name: tbl.name, rowCount: Math.max(0, Number(tbl.row_count)), columns });
      }
      // Views
      const viewRes = await pool.query(`SELECT viewname AS name FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`);
      const views = viewRes.rows.map((r) => r.name);
      // Functions
      const fnRes = await pool.query(`SELECT proname AS name FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace WHERE n.nspname = 'public' ORDER BY proname`);
      const functions = fnRes.rows.map((r) => r.name);
      return { tables, views, storedProcedures: [], functions };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const pool = entry.client;
      const dbName = entry.meta.database;
      const [tblRows] = await pool.query(`SELECT TABLE_NAME as name, TABLE_ROWS as row_count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [dbName]);
      const tables = [];
      for (const tbl of tblRows) {
        const [colRows] = await pool.query(`SELECT COLUMN_NAME as name, COLUMN_TYPE as type, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [dbName, tbl.name]);
        const [fkRows] = await pool.query(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [dbName, tbl.name]);
        const fkMap = {};
        for (const fk of fkRows) fkMap[fk.COLUMN_NAME] = { fkTable: fk.REFERENCED_TABLE_NAME, fkColumn: fk.REFERENCED_COLUMN_NAME };
        const columns = colRows.map((c) => ({
          name: c.name, type: c.type.toUpperCase(), pk: c.COLUMN_KEY === "PRI",
          ...(fkMap[c.name] ? { fk: true, fkTable: fkMap[c.name].fkTable, fkColumn: fkMap[c.name].fkColumn } : {}),
        }));
        tables.push({ name: tbl.name, rowCount: tbl.row_count || 0, columns });
      }
      const [viewRows] = await pool.query(`SELECT TABLE_NAME as name FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [dbName]);
      const [spRows] = await pool.query(`SELECT ROUTINE_NAME as name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME`, [dbName]);
      const [fnRows] = await pool.query(`SELECT ROUTINE_NAME as name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME`, [dbName]);
      return { tables, views: viewRows.map((r) => r.name), storedProcedures: spRows.map((r) => r.name), functions: fnRows.map((r) => r.name) };
    }

    if (entry.type === "sqlite") {
      const db = entry.client;
      const tblRows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
      const tables = [];
      for (const tbl of tblRows) {
        const colRows = db.prepare(`PRAGMA table_info(${_dbQuoteId("sqlite", tbl.name)})`).all();
        const fkRows = db.prepare(`PRAGMA foreign_key_list(${_dbQuoteId("sqlite", tbl.name)})`).all();
        const fkMap = {};
        for (const fk of fkRows) fkMap[fk.from] = { fkTable: fk.table, fkColumn: fk.to };
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${_dbQuoteId("sqlite", tbl.name)}`).get();
        const columns = colRows.map((c) => ({
          name: c.name, type: (c.type || "TEXT").toUpperCase(), pk: c.pk === 1,
          ...(fkMap[c.name] ? { fk: true, fkTable: fkMap[c.name].fkTable, fkColumn: fkMap[c.name].fkColumn } : {}),
        }));
        tables.push({ name: tbl.name, rowCount: countRow.cnt, columns });
      }
      const viewRows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name`).all();
      return { tables, views: viewRows.map((r) => r.name), storedProcedures: [], functions: [] };
    }

    if (entry.type === "mongodb") {
      const dbName = entry.meta.database || "test";
      const mdb = entry.client.db(dbName);
      const colls = await mdb.listCollections().toArray();
      const tables = [];
      for (const coll of colls) {
        const count = await mdb.collection(coll.name).estimatedDocumentCount();
        // Sample docs to infer fields
        const sample = await mdb.collection(coll.name).find({}).limit(20).toArray();
        const fieldMap = {};
        for (const doc of sample) {
          for (const [k, v] of Object.entries(doc)) {
            if (!fieldMap[k]) fieldMap[k] = typeof v === "object" ? (Array.isArray(v) ? "ARRAY" : "OBJECT") : (typeof v).toUpperCase();
          }
        }
        const columns = Object.entries(fieldMap).map(([name, type]) => ({
          name, type, pk: name === "_id",
        }));
        tables.push({ name: coll.name, rowCount: count, columns });
      }
      return { tables, views: [], storedProcedures: [], functions: [] };
    }

    if (entry.type === "redis") {
      // Redis doesn't have traditional schema
      const info = await entry.client.info("keyspace");
      const dbMatch = info.match(/db\d+:keys=(\d+)/);
      const keyCount = dbMatch ? parseInt(dbMatch[1]) : 0;
      return {
        tables: [{ name: "keys", rowCount: keyCount, columns: [
          { name: "key", type: "STRING", pk: true },
          { name: "value", type: "STRING" },
          { name: "type", type: "STRING" },
          { name: "ttl", type: "INTEGER" },
        ]}],
        views: [], storedProcedures: [], functions: [],
      };
    }

    if (entry.type === "sqlserver") {
      const pool = entry.client;
      const tblRes = await pool.request().query(`SELECT t.TABLE_NAME as name, SUM(p.rows) as row_count FROM INFORMATION_SCHEMA.TABLES t LEFT JOIN sys.partitions p ON OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME) = p.object_id AND p.index_id IN (0,1) WHERE t.TABLE_TYPE = 'BASE TABLE' GROUP BY t.TABLE_NAME ORDER BY t.TABLE_NAME`);
      const tables = [];
      for (const tbl of tblRes.recordset) {
        const colRes = await pool.request().input("tbl", tbl.name).query(`SELECT COLUMN_NAME as name, DATA_TYPE as type, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA+'.'+TABLE_NAME), COLUMN_NAME, 'IsIdentity') as is_identity FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl ORDER BY ORDINAL_POSITION`);
        const columns = colRes.recordset.map((c) => ({ name: c.name, type: c.type.toUpperCase(), pk: c.is_identity === 1 }));
        tables.push({ name: tbl.name, rowCount: tbl.row_count || 0, columns });
      }
      const viewRes = await pool.request().query(`SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.VIEWS ORDER BY TABLE_NAME`);
      const spRes = await pool.request().query(`SELECT ROUTINE_NAME as name FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME`);
      const fnRes = await pool.request().query(`SELECT ROUTINE_NAME as name FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME`);
      return { tables, views: viewRes.recordset.map((r) => r.name), storedProcedures: spRes.recordset.map((r) => r.name), functions: fnRes.recordset.map((r) => r.name) };
    }

    return { error: `Unsupported: ${entry.type}` };
  } catch (e) {
    return { error: e.message };
  }
});

// ── KawaiiDB: fetch table data (paginated) ──────────────────────────────────
ipcMain.handle("kawaiidb:fetch-table-data", async (_, { connectionId, tableName, page, pageSize, sortColumn, sortDir }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { error: "No active connection" };

  const pg = page || 1;
  const ps = pageSize || 25;
  const offset = (pg - 1) * ps;
  const qid = _dbQuoteId(entry.type, tableName);
  const orderClause = sortColumn ? `ORDER BY ${_dbQuoteId(entry.type, sortColumn)} ${sortDir === "desc" ? "DESC" : "ASC"}` : "";

  try {
    if (entry.type === "postgresql") {
      const countRes = await entry.client.query(`SELECT COUNT(*) as cnt FROM ${qid}`);
      const totalRows = parseInt(countRes.rows[0].cnt);
      const dataRes = await entry.client.query(`SELECT * FROM ${qid} ${orderClause} LIMIT ${ps} OFFSET ${offset}`);
      const columns = dataRes.fields.map((f) => f.name);
      const rows = dataRes.rows.map((r) => {
        const obj = {};
        for (const col of columns) {
          let v = r[col];
          if (v instanceof Date) v = v.toISOString();
          else if (Buffer.isBuffer(v)) v = `<binary ${v.length}B>`;
          else if (typeof v === "bigint") v = v.toString();
          obj[col] = v;
        }
        return obj;
      });
      return { columns, rows, totalRows, page: pg, pageSize: ps };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const [[countRow]] = await entry.client.query(`SELECT COUNT(*) as cnt FROM ${qid}`);
      const totalRows = countRow.cnt;
      const [dataRows, fields] = await entry.client.query(`SELECT * FROM ${qid} ${orderClause} LIMIT ${ps} OFFSET ${offset}`);
      const columns = fields.map((f) => f.name);
      const rows = dataRows.map((r) => {
        const obj = {};
        for (const col of columns) { let v = r[col]; if (v instanceof Date) v = v.toISOString(); else if (Buffer.isBuffer(v)) v = `<binary ${v.length}B>`; obj[col] = v; }
        return obj;
      });
      return { columns, rows, totalRows, page: pg, pageSize: ps };
    }

    if (entry.type === "sqlite") {
      const countRow = entry.client.prepare(`SELECT COUNT(*) as cnt FROM ${qid}`).get();
      const totalRows = countRow.cnt;
      const orderSQL = sortColumn ? `ORDER BY ${_dbQuoteId("sqlite", sortColumn)} ${sortDir === "desc" ? "DESC" : "ASC"}` : "";
      const rows = entry.client.prepare(`SELECT * FROM ${qid} ${orderSQL} LIMIT ? OFFSET ?`).all(ps, offset);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { columns, rows, totalRows, page: pg, pageSize: ps };
    }

    if (entry.type === "mongodb") {
      const mdb = entry.client.db(entry.meta.database || "test");
      const coll = mdb.collection(tableName);
      const totalRows = await coll.estimatedDocumentCount();
      const sort = sortColumn ? { [sortColumn]: sortDir === "desc" ? -1 : 1 } : {};
      const docs = await coll.find({}).sort(sort).skip(offset).limit(ps).toArray();
      const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
      const rows = docs.map((d) => {
        const obj = {};
        for (const k of columns) { obj[k] = typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k]; }
        return obj;
      });
      return { columns, rows, totalRows, page: pg, pageSize: ps };
    }

    if (entry.type === "redis") {
      // Scan keys
      const keys = [];
      let cursor = "0";
      do {
        const [nextCursor, batch] = await entry.client.scan(cursor, "COUNT", 100);
        cursor = nextCursor;
        keys.push(...batch);
        if (keys.length >= offset + ps + 10) break;
      } while (cursor !== "0");
      const pageKeys = keys.slice(offset, offset + ps);
      const rows = [];
      for (const k of pageKeys) {
        const type = await entry.client.type(k);
        const ttl = await entry.client.ttl(k);
        let value = "";
        try {
          if (type === "string") value = await entry.client.get(k);
          else if (type === "list") value = `[list: ${await entry.client.llen(k)} items]`;
          else if (type === "set") value = `[set: ${await entry.client.scard(k)} members]`;
          else if (type === "hash") value = `[hash: ${await entry.client.hlen(k)} fields]`;
          else if (type === "zset") value = `[zset: ${await entry.client.zcard(k)} members]`;
        } catch { value = "(error)"; }
        rows.push({ key: k, value, type, ttl });
      }
      return { columns: ["key", "value", "type", "ttl"], rows, totalRows: keys.length, page: pg, pageSize: ps };
    }

    if (entry.type === "sqlserver") {
      const countRes = await entry.client.request().query(`SELECT COUNT(*) as cnt FROM ${qid}`);
      const totalRows = countRes.recordset[0].cnt;
      const order = sortColumn ? `ORDER BY ${_dbQuoteId("sqlserver", sortColumn)} ${sortDir === "desc" ? "DESC" : "ASC"}` : "ORDER BY (SELECT NULL)";
      const dataRes = await entry.client.request().query(`SELECT * FROM ${qid} ${order} OFFSET ${offset} ROWS FETCH NEXT ${ps} ROWS ONLY`);
      const columns = dataRes.recordset.length > 0 ? Object.keys(dataRes.recordset[0]) : [];
      return { columns, rows: dataRes.recordset, totalRows, page: pg, pageSize: ps };
    }

    return { error: `Unsupported: ${entry.type}` };
  } catch (e) {
    return { error: e.message };
  }
});

// ── KawaiiDB: server info ───────────────────────────────────────────────────
ipcMain.handle("kawaiidb:get-server-info", async (_, { connectionId }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { error: "No active connection" };

  try {
    if (entry.type === "postgresql") {
      const pool = entry.client;
      const [verRes, uptimeRes, sizeRes, connRes, maxRes, statsRes] = await Promise.all([
        pool.query("SELECT version()"),
        pool.query("SELECT EXTRACT(EPOCH FROM current_timestamp - pg_postmaster_start_time()) AS uptime_sec"),
        pool.query("SELECT pg_database_size(current_database()) AS size"),
        pool.query("SELECT count(*) AS cnt FROM pg_stat_activity"),
        pool.query("SHOW max_connections"),
        pool.query("SELECT * FROM pg_stat_database WHERE datname = current_database()"),
      ]);
      const uptimeSec = Math.floor(verRes.rows[0] ? uptimeRes.rows[0].uptime_sec : 0);
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const uptime = `${days}d ${hours}h ${mins}m`;
      const dbSize = (sizeRes.rows[0].size / (1024 * 1024)).toFixed(1);
      const activeConns = parseInt(connRes.rows[0].cnt);
      const maxConns = parseInt(maxRes.rows[0].max_connections);
      const connPct = Math.round((activeConns / maxConns) * 100);
      const stats = statsRes.rows[0] || {};
      const queriesTotal = (stats.tup_returned || 0) + (stats.tup_fetched || 0) + (stats.tup_inserted || 0) + (stats.tup_updated || 0) + (stats.tup_deleted || 0);

      return {
        version: entry.meta.version,
        uptime,
        serverInfo: [
          { label: "Server", value: entry.meta.version },
          { label: "Connection", value: entry.meta.database },
          { label: "Uptime", value: uptime },
          { label: "Database Size", value: `${dbSize} MB` },
          { label: "Active Connections", value: `${activeConns} / ${maxConns}`, progress: connPct, progressColor: connPct > 80 ? "#F85149" : "#3DEFE9" },
          { label: "Tuples Returned", value: (stats.tup_returned || 0).toLocaleString() },
          { label: "Tuples Fetched", value: (stats.tup_fetched || 0).toLocaleString() },
          { label: "Transactions", value: `${(stats.xact_commit || 0).toLocaleString()} committed` },
        ],
        metrics: {
          queriesPerSec: Math.round(queriesTotal / Math.max(1, uptimeSec)),
          avgQueryTime: stats.blk_read_time ? Math.round(stats.blk_read_time / Math.max(1, queriesTotal)) : 0,
          diskUsed: parseFloat(dbSize),
          diskTotal: 100,
        },
      };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const pool = entry.client;
      const [[verRow]] = await pool.query("SELECT VERSION() as v");
      const [[uptimeRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Uptime'");
      const [[threadsRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Threads_connected'");
      const [[maxRow]] = await pool.query("SHOW VARIABLES LIKE 'max_connections'");
      const [[slowRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Slow_queries'");
      const [[questionsRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Questions'");
      const [[sizeRow]] = await pool.query(`SELECT SUM(data_length + index_length) AS size FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`, [entry.meta.database]);
      const [[bufferRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_pages_total'");
      const [[bufferFreeRow]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_pages_free'");

      const uptimeSec = parseInt(uptimeRow?.Value || 0);
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const uptime = `${days}d ${hours}h ${mins}m`;
      const threads = parseInt(threadsRow?.Value || 0);
      const maxConns = parseInt(maxRow?.Value || 100);
      const connPct = Math.round((threads / maxConns) * 100);
      const questions = parseInt(questionsRow?.Value || 0);
      const dbSizeMB = ((sizeRow?.size || 0) / (1024 * 1024)).toFixed(1);
      const bufTotal = parseInt(bufferRow?.Value || 0);
      const bufFree = parseInt(bufferFreeRow?.Value || 0);
      const bufPct = bufTotal > 0 ? Math.round(((bufTotal - bufFree) / bufTotal) * 100) : 0;

      return {
        version: entry.meta.version,
        uptime,
        serverInfo: [
          { label: "Server", value: entry.meta.version },
          { label: "Database", value: entry.meta.database || "--" },
          { label: "Uptime", value: uptime },
          { label: "Database Size", value: `${dbSizeMB} MB` },
          { label: "Buffer Pool", value: `${bufPct}% used`, progress: bufPct, progressColor: bufPct > 80 ? "#F85149" : "#3FB950" },
          { label: "Slow Queries", value: (parseInt(slowRow?.Value) || 0).toLocaleString(), valueColor: parseInt(slowRow?.Value) > 100 ? "#F85149" : undefined },
          { label: "Connections", value: `${threads} / ${maxConns}`, progress: connPct, progressColor: connPct > 80 ? "#F85149" : "#3DEFE9" },
          { label: "Total Queries", value: questions.toLocaleString() },
        ],
        metrics: {
          queriesPerSec: Math.round(questions / Math.max(1, uptimeSec)),
          avgQueryTime: 0,
          diskUsed: parseFloat(dbSizeMB),
          diskTotal: 100,
        },
      };
    }

    if (entry.type === "sqlite") {
      const db = entry.client;
      const pageCount = db.prepare("PRAGMA page_count").get();
      const pageSize = db.prepare("PRAGMA page_size").get();
      const sizeMB = ((pageCount.page_count * pageSize.page_size) / (1024 * 1024)).toFixed(1);
      const journal = db.prepare("PRAGMA journal_mode").get();
      return {
        version: entry.meta.version,
        uptime: "N/A (file DB)",
        serverInfo: [
          { label: "Engine", value: entry.meta.version },
          { label: "Database", value: entry.meta.database },
          { label: "File Size", value: `${sizeMB} MB` },
          { label: "Journal Mode", value: journal.journal_mode },
          { label: "Page Size", value: `${pageSize.page_size} bytes` },
          { label: "Page Count", value: pageCount.page_count.toLocaleString() },
        ],
        metrics: { queriesPerSec: 0, avgQueryTime: 0, diskUsed: parseFloat(sizeMB), diskTotal: 100 },
      };
    }

    if (entry.type === "mongodb") {
      const admin = entry.client.db("admin");
      const status = await admin.command({ serverStatus: 1 });
      const uptimeSec = status.uptime || 0;
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const memMB = status.mem ? status.mem.resident : 0;
      const conns = status.connections || {};

      return {
        version: entry.meta.version,
        uptime: `${days}d ${hours}h ${mins}m`,
        serverInfo: [
          { label: "Server", value: entry.meta.version },
          { label: "Database", value: entry.meta.database },
          { label: "Uptime", value: `${days}d ${hours}h ${mins}m` },
          { label: "Memory", value: `${memMB} MB resident` },
          { label: "Connections", value: `${conns.current || 0} / ${conns.available || 0}`, progress: conns.available ? Math.round((conns.current / conns.available) * 100) : 0, progressColor: "#3DEFE9" },
          { label: "Operations", value: `${((status.opcounters?.query || 0) + (status.opcounters?.insert || 0)).toLocaleString()} total` },
        ],
        metrics: { queriesPerSec: Math.round((status.opcounters?.query || 0) / Math.max(1, uptimeSec)), avgQueryTime: 0, diskUsed: memMB, diskTotal: 1000 },
      };
    }

    if (entry.type === "redis") {
      const infoAll = await entry.client.info();
      const extract = (key) => { const m = infoAll.match(new RegExp(`${key}:(.+)`)); return m ? m[1].trim() : "0"; };
      const uptimeSec = parseInt(extract("uptime_in_seconds"));
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const usedMem = extract("used_memory_human");
      const connectedClients = extract("connected_clients");
      const totalCommands = extract("total_commands_processed");
      return {
        version: entry.meta.version,
        uptime: `${days}d ${hours}h`,
        serverInfo: [
          { label: "Server", value: entry.meta.version },
          { label: "Uptime", value: `${days}d ${hours}h` },
          { label: "Memory Used", value: usedMem },
          { label: "Connected Clients", value: connectedClients },
          { label: "Total Commands", value: parseInt(totalCommands).toLocaleString() },
          { label: "Keyspace Hits", value: extract("keyspace_hits") },
        ],
        metrics: { queriesPerSec: Math.round(parseInt(totalCommands) / Math.max(1, uptimeSec)), avgQueryTime: 0, diskUsed: 0, diskTotal: 100 },
      };
    }

    return { serverInfo: [{ label: "Server", value: entry.meta.version }], metrics: {} };
  } catch (e) {
    return { error: e.message };
  }
});

// ── KawaiiDB: active queries ────────────────────────────────────────────────
ipcMain.handle("kawaiidb:get-active-queries", async (_, { connectionId }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { queries: [] };

  try {
    if (entry.type === "postgresql") {
      const res = await entry.client.query(`
        SELECT pid, usename AS user, datname AS db, query, state,
          EXTRACT(EPOCH FROM now() - query_start)::int AS duration_sec
        FROM pg_stat_activity
        WHERE state != 'idle' AND pid != pg_backend_pid()
        ORDER BY query_start
      `);
      return { queries: res.rows.map((r) => ({ pid: r.pid, user: r.user, db: r.db, query: r.query, duration: `${r.duration_sec}s`, state: r.state })) };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const [rows] = await entry.client.query(`SELECT ID as pid, USER as user, DB as db, INFO as query, TIME as duration_sec, COMMAND as state FROM information_schema.PROCESSLIST WHERE COMMAND != 'Sleep' AND ID != CONNECTION_ID() ORDER BY TIME DESC`);
      return { queries: rows.map((r) => ({ pid: r.pid, user: r.user, db: r.db, query: r.query, duration: `${r.duration_sec}s`, state: r.state })) };
    }

    if (entry.type === "mongodb") {
      const ops = await entry.client.db("admin").command({ currentOp: true, active: true });
      return { queries: (ops.inprog || []).slice(0, 20).map((op) => ({ pid: op.opid, user: op.client || "--", db: op.ns, query: JSON.stringify(op.command || {}).slice(0, 200), duration: `${Math.round((op.microsecs_running || 0) / 1e6)}s`, state: op.op })) };
    }

    return { queries: [] };
  } catch (e) {
    return { queries: [], error: e.message };
  }
});

// ── KawaiiDB: query type stats (for dashboard donut chart) ──────────────────
ipcMain.handle("kawaiidb:get-query-stats", async (_, { connectionId }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { stats: null };

  try {
    if (entry.type === "postgresql") {
      const res = await entry.client.query(`
        SELECT tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted
        FROM pg_stat_database WHERE datname = current_database()
      `);
      const r = res.rows[0] || {};
      return {
        stats: {
          select: Number(r.tup_returned || 0) + Number(r.tup_fetched || 0),
          insert: Number(r.tup_inserted || 0),
          update: Number(r.tup_updated || 0),
          delete: Number(r.tup_deleted || 0),
        },
      };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const vars = ["Com_select", "Com_insert", "Com_update", "Com_delete"];
      const [rows] = await entry.client.query(
        `SHOW GLOBAL STATUS WHERE Variable_name IN (${vars.map(() => "?").join(",")})`,
        vars
      );
      const map = {};
      for (const r of rows) map[r.Variable_name] = parseInt(r.Value || 0);
      return {
        stats: {
          select: map.Com_select || 0,
          insert: map.Com_insert || 0,
          update: map.Com_update || 0,
          delete: map.Com_delete || 0,
        },
      };
    }

    if (entry.type === "mongodb") {
      const info = await entry.client.db("admin").command({ serverStatus: 1 });
      const ops = info.opcounters || {};
      return {
        stats: {
          select: Number(ops.query || 0) + Number(ops.getmore || 0),
          insert: Number(ops.insert || 0),
          update: Number(ops.update || 0),
          delete: Number(ops.delete || 0),
        },
      };
    }

    return { stats: null };
  } catch (e) {
    return { stats: null, error: e.message };
  }
});

// ── KawaiiDB: explain query ─────────────────────────────────────────────────
ipcMain.handle("kawaiidb:explain-query", async (_, { connectionId, sql }) => {
  const entry = _dbPools.get(connectionId);
  if (!entry) return { plan: [] };

  try {
    if (entry.type === "postgresql") {
      const res = await entry.client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
      const planJson = res.rows[0]["QUERY PLAN"] || res.rows[0]["query plan"];
      const planArr = Array.isArray(planJson) ? planJson : [planJson];
      const rows = [];
      function walkPlan(node) {
        if (!node) return;
        const plan = node.Plan || node;
        const scanType = plan["Node Type"] || "Unknown";
        const typeMap = { "Seq Scan": "ALL", "Index Scan": "ref", "Index Only Scan": "ref", "Bitmap Heap Scan": "range", "Hash Join": "join", "Nested Loop": "loop", "Merge Join": "merge", "Sort": "sort", "Aggregate": "agg" };
        rows.push({
          table: plan["Relation Name"] || plan["Alias"] || "--",
          type: typeMap[scanType] || scanType,
          rows: `~${Math.round(plan["Plan Rows"] || 0)}`,
          key: plan["Index Name"] || null,
          extra: [plan["Filter"], plan["Sort Key"] ? `Sort: ${plan["Sort Key"].join(",")}` : null].filter(Boolean).join("; ") || scanType,
        });
        if (plan.Plans) plan.Plans.forEach(walkPlan);
      }
      planArr.forEach(walkPlan);
      return { plan: rows };
    }

    if (entry.type === "mysql" || entry.type === "mariadb") {
      const [rows] = await entry.client.query(`EXPLAIN ${sql}`);
      return {
        plan: rows.map((r) => ({
          table: r.table || "--",
          type: r.type || "ALL",
          rows: `~${r.rows || 0}`,
          key: r.key || null,
          extra: r.Extra || "",
        })),
      };
    }

    if (entry.type === "sqlite") {
      const rows = entry.client.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
      return {
        plan: rows.map((r) => ({
          table: r.detail?.match(/(?:SCAN|SEARCH) TABLE (\w+)/)?.[1] || "--",
          type: r.detail?.includes("SEARCH") ? "ref" : r.detail?.includes("SCAN") ? "ALL" : "misc",
          rows: "~?",
          key: r.detail?.match(/USING (?:INDEX|COVERING INDEX) (\w+)/)?.[1] || null,
          extra: r.detail || "",
        })),
      };
    }

    return { plan: [] };
  } catch (e) {
    return { plan: [], error: e.message };
  }
});

// ── Shinra Tensei filesystem IPC ──────────────────────────────────────────────
ipcMain.handle("shinra:read-dir", async (_, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return {
      entries: entries
        .filter(e => !e.name.startsWith("."))
        .map(e => ({
          name: e.name,
          isDir: e.isDirectory(),
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name)),
    };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("shinra:read-file", async (_, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 2 * 1024 * 1024) return { error: "File too large (>2MB)" };
    const content = fs.readFileSync(filePath, "utf-8");
    return { content, size: stat.size, modified: stat.mtimeMs };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("shinra:write-file", async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("shinra:file-stat", async (_, filePath) => {
  try {
    const s = fs.statSync(filePath);
    return { size: s.size, modified: s.mtimeMs, isDir: s.isDirectory(), isFile: s.isFile() };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("shinra:search-files", async (_, { dir, query, glob: globPattern }) => {
  try {
    const results = [];
    const maxResults = 100;
    const q = query.toLowerCase();
    function walk(d, depth) {
      if (depth > 8 || results.length >= maxResults) return;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (results.length >= maxResults) return;
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) { walk(fp, depth + 1); continue; }
        if (globPattern) {
          const ext = path.extname(e.name).slice(1);
          const exts = globPattern.replace(/\*/g, "").split(",").map(s => s.trim());
          if (exts.length > 0 && exts[0] !== "" && !exts.includes(ext)) continue;
        }
        try {
          const stat = fs.statSync(fp);
          if (stat.size > 512 * 1024) continue;
          const content = fs.readFileSync(fp, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(q)) {
              results.push({ file: fp, line: i + 1, text: lines[i].slice(0, 200) });
              if (results.length >= maxResults) return;
            }
          }
        } catch {}
      }
    }
    walk(dir, 0);
    return { results };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("shinra:run-command", async (_, { cmd, cwd }) => {
  const { exec } = require("child_process");
  return new Promise((resolve) => {
    exec(cmd, { cwd: cwd || os.homedir(), timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || "", stderr: stderr || "", exitCode: err ? err.code || 1 : 0 });
    });
  });
});

// ── Persistent shell session ──────────────────────────────────────────────────
let _shellProc = null;
let _shellCwd = null;

ipcMain.handle("shinra:shell-create", (_, { cwd }) => {
  const { spawn } = require("child_process");
  if (_shellProc) { try { _shellProc.kill(); } catch {} }
  _shellCwd = cwd || os.homedir();
  const shellBin = process.env.SHELL || "/bin/zsh";
  _shellProc = spawn(shellBin, ["-l"], {
    cwd: _shellCwd,
    env: { ...process.env, TERM: "xterm-256color", LANG: "en_US.UTF-8" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

  _shellProc.stdout.on("data", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("shinra:shell-stdout", data.toString());
  });
  _shellProc.stderr.on("data", (data) => {
    if (win && !win.isDestroyed()) win.webContents.send("shinra:shell-stderr", data.toString());
  });
  _shellProc.on("exit", (code) => {
    if (win && !win.isDestroyed()) win.webContents.send("shinra:shell-exit", code ?? 0);
    _shellProc = null;
  });

  return { ok: true, pid: _shellProc.pid, shell: shellBin };
});

ipcMain.handle("shinra:shell-write", (_, data) => {
  if (_shellProc && _shellProc.stdin.writable) {
    _shellProc.stdin.write(data);
    return { ok: true };
  }
  return { ok: false, msg: "No active shell session" };
});

ipcMain.handle("shinra:shell-destroy", () => {
  if (_shellProc) { try { _shellProc.kill(); } catch {} _shellProc = null; }
  return { ok: true };
});

ipcMain.handle("shinra:select-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled) return { canceled: true };
  return { path: result.filePaths[0] };
});

// ── Shinra file watcher ──────────────────────────────────────────────────────
let _fsWatcher = null;
let _fsChangeBuf = new Set();
let _fsChangeTimer = null;

ipcMain.handle("shinra:watch-start", async (_, { dir, extensions }) => {
  if (_fsWatcher) { _fsWatcher.close(); _fsWatcher = null; }
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win || !dir) return { ok: false };
  const IGNORED = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__", ".cache", ".turbo", "venv", ".venv", "target", "vendor"]);
  const extSet = extensions ? new Set(extensions) : null;
  try {
    _fsWatcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const parts = filename.split(path.sep);
      if (parts.some(p => IGNORED.has(p))) return;
      const ext = path.extname(filename).slice(1);
      if (extSet && !extSet.has(ext)) return;
      const fullPath = path.join(dir, filename);
      _fsChangeBuf.add(fullPath);
      if (_fsChangeTimer) clearTimeout(_fsChangeTimer);
      _fsChangeTimer = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send("shinra:fs-changed-batch", { paths: Array.from(_fsChangeBuf) });
        }
        _fsChangeBuf.clear();
      }, 300);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("shinra:watch-stop", async () => {
  if (_fsWatcher) { _fsWatcher.close(); _fsWatcher = null; }
  if (_fsChangeTimer) { clearTimeout(_fsChangeTimer); _fsChangeTimer = null; }
  _fsChangeBuf.clear();
  return { ok: true };
});

ipcMain.handle("memory:save-review", (_, p) => memSaveReview(p));
ipcMain.handle("memory:update-outcome", (_, id, outcome) => memUpdateOutcome(id, outcome));
ipcMain.handle("memory:query-context", (_, p) => memQueryContext(p));
ipcMain.handle("memory:build-context-block", (_, ctx) => memBuildContextBlock(ctx));
ipcMain.handle("memory:list-reviews", (_, opts) => memListReviews(opts));
ipcMain.handle("memory:get-review-detail", (_, id) => memGetReviewDetail(id));
ipcMain.handle("memory:archive-reviews", (_, ids) => memArchiveReviews(ids));

ipcMain.handle("review:save-file", (_, { workingDir, repoSlug, prNumber, content, meta }) => {
  try {
    const dir = path.join(workingDir, "reviews", repoSlug); fs.mkdirSync(dir, { recursive: true });
    const base = `pr-${prNumber}-${Date.now()}`;
    fs.writeFileSync(path.join(dir, `${base}.md`), content, "utf8");
    fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(meta, null, 2), "utf8");
    return { ok: true, base };
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle("review:delete-file", (_, { workingDir, repoSlug, base }) => {
  try { for (const ext of [".md",".json"]) { const p = path.join(workingDir,"reviews",repoSlug,`${base}${ext}`); if (fs.existsSync(p)) fs.unlinkSync(p); } return { ok: true }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle("ai:review", async (_, { diff, memoryContext, provider, apiKey, model }) => {
  const system = `You are Sharingan, an expert AI code reviewer embedded in Akatsuki.

PRIMARY GOAL: Produce detailed INLINE findings pinned to exact lines of the diff.
Aim for 5–15 inline findings across the changed files — these are the primary output.

Return ONLY valid JSON (no markdown fences, no prose outside the JSON):
{
  "riskScore": <0-10>,
  "summary": "<2-3 sentence overall summary>",
  "findings": [
    {
      "severity": "critical|warning|info",
      "category": "<tag: security|logic|perf|style|test|deps>",
      "filePath": "<exact file path — matches the +++ b/<path> header in the diff, strip the 'b/' prefix>",
      "lineStart": <the NEW-FILE line number of this line, as counted from the +N in the @@ -O,C +N,C @@ hunk header>,
      "lineEnd": <same as lineStart or a few lines later>,
      "description": "<specific inline comment — what is wrong or notable at this exact line>",
      "suggestion": "<concrete fix or alternative code>"
    }
  ],
  "reviewText": "<brief 2-3 paragraph markdown summary; do NOT repeat all findings in prose>"
}

Rules:
- filePath: strip the 'b/' prefix from +++ b/<path> → just <path>
- lineStart: count new-file line numbers starting from N in @@ -O,C +N,C @@; context lines and '+' lines both increment the counter; '-' lines do NOT
- Every finding must be specific and actionable — no vague comments
- Severity: critical = bugs/security, warning = code quality, info = suggestions
- Prioritize critical and warning findings; include at least 3 inline findings per file changed

${memoryContext ?? ""}`;
  const user = `Review this diff:\n\`\`\`diff\n${diff}\n\`\`\``;
  try { return provider==="anthropic" ? await callAnthropic({apiKey,model,system,user}) : await callOpenAI({apiKey,model,system,user}); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle("ai:chat", async (_, { messages, provider, apiKey, model }) => {
  const system = "You are Sharingan, an AI code review assistant. Answer questions about code diffs concisely.";
  try { return provider==="anthropic" ? await callAnthropic({apiKey,model,system,messages}) : await callOpenAI({apiKey,model,system,messages}); }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle("git:test-auth", async (_, { platform, token, instanceUrl, username, email }) => {
  try {
    if (platform === "github") {
      const d = await ghGet("https://api.github.com/user", {
        "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json",
      });
      if (d.login) return { ok: true, username: d.login, name: d.name };
      return { error: d.message || "Authentication failed" };
    }
    if (platform === "gitlab") {
      const base = (instanceUrl || "https://gitlab.com").replace(/\/$/, "");
      const d = await ghGet(`${base}/api/v4/user`, { "PRIVATE-TOKEN": token });
      if (d.username) return { ok: true, username: d.username, name: d.name };
      return { error: d.message || "Authentication failed" };
    }
    if (platform === "bitbucket") {
      // Atlassian API tokens use Basic auth: email:token
      if (email) {
        const creds = Buffer.from(`${email}:${token}`).toString("base64");
        const d = await ghGet("https://api.bitbucket.org/2.0/user", { "Authorization": `Basic ${creds}` });
        if (d.nickname || d.display_name) return { ok: true, username: d.nickname || d.display_name };
        return { error: d.error?.message || "Authentication failed — check your email and token" };
      }
      // Legacy: try Bearer (older HTTP Access Tokens)
      if (username) {
        const creds = Buffer.from(`${username}:${token}`).toString("base64");
        const d = await ghGet("https://api.bitbucket.org/2.0/user", { "Authorization": `Basic ${creds}` });
        if (d.nickname || d.display_name) return { ok: true, username: d.nickname || d.display_name };
        return { error: d.error?.message || "Authentication failed" };
      }
      return { error: "Enter your Atlassian email above, then try again" };
    }
    return { error: "Unknown platform" };
  } catch (e) { return { error: e.message }; }
});

// Fetch available Bitbucket workspaces for the authenticated user
ipcMain.handle("git:bitbucket-workspaces", async (_, { token, email }) => {
  try {
    if (!email) return { error: "Email required to fetch workspaces" };
    const creds = Buffer.from(`${email}:${token}`).toString("base64");
    const d = await ghGet("https://api.bitbucket.org/2.0/workspaces?pagelen=50", {
      "Authorization": `Basic ${creds}`,
    });
    if (d.values) return { workspaces: d.values.map(w => ({ slug: w.slug, name: w.name })) };
    return { error: d.error?.message || "Could not fetch workspaces" };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("git:fetch-pr", async (_, { url, token, email }) => {
  const pr = parsePRUrl(url);
  if (!pr) return { error: "Paste a valid PR URL (github.com/.../pull/N, bitbucket.org/.../pull-requests/N, or gitlab.com/.../-/merge_requests/N)" };
  try {
    if (pr.platform === "github")    return await ghFetchPR(pr.owner, pr.repo, pr.id, token);
    if (pr.platform === "bitbucket") return await bbFetchPR(pr.owner, pr.repo, pr.id, token, email);
    if (pr.platform === "gitlab")    return await glFetchPR(pr.owner, pr.repo, pr.id, token);
    return { error: "Unsupported platform" };
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle("git:fetch-diff", async (_, { url, token, email }) => {
  const pr = parsePRUrl(url);
  if (!pr) return { error: "Invalid URL" };
  try {
    let diff;
    if (pr.platform === "github")         diff = await ghFetchDiff(pr.owner, pr.repo, pr.id, token);
    else if (pr.platform === "bitbucket") diff = await bbFetchDiff(pr.owner, pr.repo, pr.id, token, email);
    else if (pr.platform === "gitlab")    diff = await glFetchDiff(pr.owner, pr.repo, pr.id, token);
    else return { error: "Unsupported platform" };
    return { diff };
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle("git:post-review", async (_, { url, token, email, body }) => {
  const pr = parsePRUrl(url);
  if (!pr) return { error: "Invalid URL" };
  try {
    if (pr.platform === "github")    return await ghPostReview(pr.owner, pr.repo, pr.id, token, body);
    if (pr.platform === "bitbucket") return await bbPostReview(pr.owner, pr.repo, pr.id, token, email, body);
    if (pr.platform === "gitlab")    return await glPostReview(pr.owner, pr.repo, pr.id, token, body);
    return { error: "Unsupported platform" };
  } catch (e) { return { error: e.message }; }
});

// ── GitHub ────────────────────────────────────────────────────────────────────
function ghGet(url, hdrs={}) {
  return new Promise((res,rej) => {
    const u = new URL(url);
    https.get({hostname:u.hostname,path:u.pathname+u.search,headers:{"User-Agent":"Akatsuki/0.1",...hdrs}}, r => {
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{res(JSON.parse(d));}catch{res(d);} });
    }).on("error",rej);
  });
}
async function ghFetchPR(owner,repo,num,token) {
  const h = token ? {Authorization:`token ${token}`} : {};
  const d = await ghGet(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}`, h);
  if (d.message) return { error: d.message };
  return {number:d.number,title:d.title,state:d.state,author:d.user?.login,branch:d.head?.ref,baseBranch:d.base?.ref,createdAt:d.created_at,additions:d.additions,deletions:d.deletions,changedFiles:d.changed_files,repoSlug:`${owner}/${repo}`,url:d.html_url};
}
function ghFetchDiff(owner,repo,num,token) {
  return new Promise((res,rej) => {
    https.get({hostname:"api.github.com",path:`/repos/${owner}/${repo}/pulls/${num}`,headers:{"User-Agent":"Akatsuki/0.1","Accept":"application/vnd.github.v3.diff",...(token?{Authorization:`token ${token}`}:{})}}, r => {
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(d));
    }).on("error",rej);
  });
}
function ghPost(url,hdrs,body) {
  return new Promise((res,rej) => {
    const u = new URL(url); const p = JSON.stringify(body);
    const req = https.request({method:"POST",hostname:u.hostname,path:u.pathname,headers:{"User-Agent":"Akatsuki/0.1","Content-Type":"application/json","Content-Length":Buffer.byteLength(p),...hdrs}}, r => {
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{res({status:r.statusCode,body:JSON.parse(d)});}catch{res({status:r.statusCode,body:d});} });
    });
    req.on("error",rej); req.write(p); req.end();
  });
}
async function ghPostReview(owner,repo,num,token,body) {
  const r = await ghPost(`https://api.github.com/repos/${owner}/${repo}/issues/${num}/comments`, {Authorization:`token ${token}`}, {body});
  return r.status===201 ? {ok:true} : {error:`GitHub returned ${r.status}: ${JSON.stringify(r.body)}`};
}

// ── URL parser ────────────────────────────────────────────────────────────────
function parsePRUrl(url) {
  const gh = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (gh) return { platform:"github",    owner:gh[1], repo:gh[2], id:parseInt(gh[3]) };
  const bb = url.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests?\/(\d+)/i);
  if (bb) return { platform:"bitbucket", owner:bb[1], repo:bb[2], id:parseInt(bb[3]) };
  const gl = url.match(/gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (gl) { const parts=gl[1].split("/"); const repo=parts.pop(); return { platform:"gitlab", owner:parts.join("/"), repo, id:parseInt(gl[2]) }; }
  return null;
}

// Raw HTTPS get that follows redirects (used for Bitbucket diff which returns 302)
function httpsGetRaw(url, hdrs={}, maxRedirects=5) {
  return new Promise((res,rej) => {
    function doGet(u, left) {
      const p = new URL(u);
      https.get({hostname:p.hostname,path:p.pathname+p.search,headers:{"User-Agent":"Akatsuki/0.1",...hdrs}}, r => {
        if ((r.statusCode===301||r.statusCode===302) && r.headers.location && left>0) { r.resume(); doGet(r.headers.location,left-1); }
        else { let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(d)); }
      }).on("error",rej);
    }
    doGet(url, maxRedirects);
  });
}

// ── Bitbucket ─────────────────────────────────────────────────────────────────
async function bbFetchPR(workspace, repo, num, token, email) {
  const creds = Buffer.from(`${email}:${token}`).toString("base64");
  const d = await ghGet(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${num}`, {"Authorization":`Basic ${creds}`});
  if (!d.id) return { error: d.error?.message || d.message || "PR not found — check workspace/repo slug and permissions" };
  return {number:d.id, title:d.title, state:d.state?.toLowerCase(), author:d.author?.nickname||d.author?.display_name, branch:d.source?.branch?.name, baseBranch:d.destination?.branch?.name, createdAt:d.created_on, additions:null, deletions:null, changedFiles:null, repoSlug:`${workspace}/${repo}`, url:d.links?.html?.href};
}
async function bbFetchDiff(workspace, repo, num, token, email) {
  const creds = Buffer.from(`${email}:${token}`).toString("base64");
  return httpsGetRaw(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${num}/diff`, {"Authorization":`Basic ${creds}`});
}
async function bbPostReview(workspace, repo, num, token, email, body) {
  const creds = Buffer.from(`${email}:${token}`).toString("base64");
  const r = await ghPost(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${num}/comments`, {"Authorization":`Basic ${creds}`}, {content:{raw:body}});
  return (r.status===200||r.status===201) ? {ok:true} : {error:`Bitbucket returned ${r.status}: ${JSON.stringify(r.body)}`};
}

// ── GitLab ────────────────────────────────────────────────────────────────────
async function glFetchPR(namespace, project, num, token) {
  const enc = encodeURIComponent(`${namespace}/${project}`);
  const d = await ghGet(`https://gitlab.com/api/v4/projects/${enc}/merge_requests/${num}`, {"PRIVATE-TOKEN":token});
  if (!d.iid) return { error: d.message || "MR not found" };
  return {number:d.iid, title:d.title, state:d.state, author:d.author?.username, branch:d.source_branch, baseBranch:d.target_branch, createdAt:d.created_at, additions:null, deletions:null, changedFiles:d.changes_count!=null?parseInt(d.changes_count):null, repoSlug:`${namespace}/${project}`, url:d.web_url};
}
async function glFetchDiff(namespace, project, num, token) {
  const enc = encodeURIComponent(`${namespace}/${project}`);
  const diffs = await ghGet(`https://gitlab.com/api/v4/projects/${enc}/merge_requests/${num}/diffs?per_page=100`, {"PRIVATE-TOKEN":token});
  if (!Array.isArray(diffs)) return "";
  return diffs.map(f=>`diff --git a/${f.old_path} b/${f.new_path}\n${f.diff||""}`).join("");
}
async function glPostReview(namespace, project, num, token, body) {
  const enc = encodeURIComponent(`${namespace}/${project}`);
  const r = await ghPost(`https://gitlab.com/api/v4/projects/${enc}/merge_requests/${num}/notes`, {"PRIVATE-TOKEN":token}, {body});
  return (r.status===200||r.status===201) ? {ok:true} : {error:`GitLab returned ${r.status}: ${JSON.stringify(r.body)}`};
}

// ── AI providers ──────────────────────────────────────────────────────────────
function callAnthropic({apiKey,model,system,user,messages}) {
  const msgs = messages||[{role:"user",content:user}];
  const payload = JSON.stringify({model:model||"claude-sonnet-4-6",max_tokens:4096,system,messages:msgs});
  return new Promise(res => {
    const req = https.request({method:"POST",hostname:"api.anthropic.com",path:"/v1/messages",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","Content-Length":Buffer.byteLength(payload)}}, r => {
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{const b=JSON.parse(d); if(b.error) return res({error:b.error.message}); res({text:b.content?.[0]?.text||"",inputTokens:b.usage?.input_tokens,outputTokens:b.usage?.output_tokens});}catch(e){res({error:e.message});} });
    });
    req.on("error",e=>res({error:e.message})); req.write(payload); req.end();
  });
}
function callOpenAI({apiKey,model,system,user,messages}) {
  const msgs=[{role:"system",content:system},...(messages||[{role:"user",content:user}])];
  const payload = JSON.stringify({model:model||"gpt-4o",max_tokens:4096,messages:msgs});
  return new Promise(res => {
    const req = https.request({method:"POST",hostname:"api.openai.com",path:"/v1/chat/completions",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,"Content-Length":Buffer.byteLength(payload)}}, r => {
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{const b=JSON.parse(d); if(b.error) return res({error:b.error.message}); res({text:b.choices?.[0]?.message?.content||"",inputTokens:b.usage?.prompt_tokens,outputTokens:b.usage?.completion_tokens});}catch(e){res({error:e.message});} });
    });
    req.on("error",e=>res({error:e.message})); req.write(payload); req.end();
  });
}

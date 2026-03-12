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

// ── KawaiiDB connection test ──────────────────────────────────────────────────
ipcMain.handle("kawaiidb:test-connection", async (_, { type, host, port, database, username, password }) => {
  const net = require("net");

  // SQLite: just check if the file exists
  if (type === "sqlite") {
    const dbPath = (host || database || "").replace(/^~/, os.homedir());
    try {
      if (fs.existsSync(dbPath)) return { ok: true, msg: "SQLite file exists and is accessible" };
      return { ok: false, msg: `File not found: ${dbPath}` };
    } catch (e) { return { ok: false, msg: e.message }; }
  }

  // For all other DB types: attempt a TCP socket connection to host:port
  const p = parseInt(port, 10);
  if (!host || !p) return { ok: false, msg: "Host and port are required" };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;
    let resolved = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on("connect", () => {
      done({ ok: true, msg: `Connected to ${host}:${p}` });
    });
    socket.on("timeout", () => {
      done({ ok: false, msg: `Connection timed out after ${timeout / 1000}s — is the server running?` });
    });
    socket.on("error", (err) => {
      if (err.code === "ECONNREFUSED") {
        done({ ok: false, msg: `Connection refused at ${host}:${p} — is the database server running?` });
      } else if (err.code === "ENOTFOUND") {
        done({ ok: false, msg: `Host not found: ${host}` });
      } else if (err.code === "EHOSTUNREACH") {
        done({ ok: false, msg: `Host unreachable: ${host}` });
      } else {
        done({ ok: false, msg: `Connection failed: ${err.message}` });
      }
    });

    socket.connect(p, host);
  });
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

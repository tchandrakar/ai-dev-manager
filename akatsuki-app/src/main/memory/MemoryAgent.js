const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let db = null;
let Database = null;

function getDb() {
  if (!db) throw new Error("MemoryAgent not initialized");
  return db;
}

function init(workingDir) {
  try {
    if (!Database) Database = require("better-sqlite3");
    const memDir = path.join(workingDir, "memory");
    const embDir = path.join(memDir, "embeddings");
    fs.mkdirSync(embDir, { recursive: true });
    fs.mkdirSync(path.join(memDir, "author-profiles"), { recursive: true });
    fs.mkdirSync(path.join(memDir, "repo-profiles"), { recursive: true });

    db = new Database(path.join(memDir, "index.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    _createSchema();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

function _createSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id            TEXT PRIMARY KEY,
      repo_slug     TEXT NOT NULL,
      pr_number     INTEGER,
      pr_title      TEXT,
      author        TEXT,
      branch        TEXT,
      risk_score    REAL,
      model         TEXT,
      token_count   INTEGER,
      outcome       TEXT DEFAULT 'pending',
      signal_weight REAL DEFAULT 0.5,
      review_text   TEXT,
      created_at    TEXT NOT NULL,
      embedding_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS findings (
      id            TEXT PRIMARY KEY,
      review_id     TEXT NOT NULL REFERENCES reviews(id),
      repo_slug     TEXT NOT NULL,
      file_path     TEXT,
      line_start    INTEGER,
      line_end      INTEGER,
      severity      TEXT,
      category      TEXT,
      description   TEXT,
      signal_weight REAL DEFAULT 0.5,
      embedding_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS file_stats (
      repo_slug     TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      flag_count    INTEGER DEFAULT 0,
      last_flagged  TEXT,
      PRIMARY KEY (repo_slug, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_findings_repo_file ON findings(repo_slug, file_path);
    CREATE INDEX IF NOT EXISTS idx_reviews_repo ON reviews(repo_slug);
    CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author);
  `);
}

function saveReview({ repoSlug, prNumber, prTitle, author, branch, riskScore, model, tokenCount, reviewText, findings }) {
  const id = crypto.createHash("sha256")
    .update(`${repoSlug}-${prNumber}-${Date.now()}`)
    .digest("hex")
    .slice(0, 16);
  const now = new Date().toISOString();

  const insertReview = getDb().prepare(`
    INSERT INTO reviews (id, repo_slug, pr_number, pr_title, author, branch, risk_score, model, token_count, review_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReview.run(id, repoSlug, prNumber, prTitle, author, branch, riskScore, model, tokenCount, reviewText, now);

  if (findings && findings.length > 0) {
    const insertFinding = getDb().prepare(`
      INSERT INTO findings (id, review_id, repo_slug, file_path, line_start, line_end, severity, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStats = getDb().prepare(`
      INSERT INTO file_stats (repo_slug, file_path, flag_count, last_flagged)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(repo_slug, file_path) DO UPDATE SET
        flag_count = flag_count + 1,
        last_flagged = excluded.last_flagged
    `);

    for (const f of findings) {
      const fid = crypto.randomUUID().slice(0, 16);
      insertFinding.run(fid, id, repoSlug, f.filePath || "", f.lineStart || 0, f.lineEnd || 0, f.severity, f.category, f.description);
      if (f.filePath) updateStats.run(repoSlug, f.filePath, now);
    }
  }

  _updateRepoProfile(repoSlug);
  if (author) _updateAuthorProfile(author, repoSlug, riskScore);

  return { id };
}

function updateOutcome(reviewId, outcome) {
  const weights = { posted: 1.0, modified: 0.7, discarded: 0.2, pending: 0.5 };
  const weight = weights[outcome] ?? 0.5;
  getDb().prepare(`UPDATE reviews SET outcome = ?, signal_weight = ? WHERE id = ?`).run(outcome, weight, reviewId);
  getDb().prepare(`UPDATE findings SET signal_weight = ? WHERE review_id = ?`).run(weight, reviewId);
  return { ok: true };
}

function queryMemoryContext({ repoSlug, author, filePaths = [] }) {
  const d = getDb();

  // File history
  let fileHistory = [];
  if (filePaths.length > 0) {
    const placeholders = filePaths.map(() => "?").join(",");
    fileHistory = d.prepare(`
      SELECT f.file_path, f.severity, f.category, f.description, f.signal_weight,
             r.pr_title, r.pr_number, r.outcome, r.created_at
      FROM findings f
      JOIN reviews r ON r.id = f.review_id
      WHERE f.repo_slug = ? AND f.file_path IN (${placeholders})
      ORDER BY f.signal_weight DESC, r.created_at DESC
      LIMIT 20
    `).all(repoSlug, ...filePaths);
  }

  // Repo profile
  const recentReviews = d.prepare(`
    SELECT risk_score, outcome FROM reviews
    WHERE repo_slug = ? ORDER BY created_at DESC LIMIT 20
  `).all(repoSlug);
  const avgRisk = recentReviews.length
    ? (recentReviews.reduce((s, r) => s + (r.risk_score || 0), 0) / recentReviews.length).toFixed(1)
    : null;

  // Top patterns
  const topPatterns = d.prepare(`
    SELECT category, COUNT(*) as cnt, AVG(signal_weight) as avg_weight
    FROM findings
    WHERE repo_slug = ?
    GROUP BY category
    ORDER BY avg_weight DESC, cnt DESC
    LIMIT 5
  `).all(repoSlug);

  // Author profile
  let authorProfile = null;
  if (author) {
    const authorReviews = d.prepare(`
      SELECT risk_score FROM reviews
      WHERE repo_slug = ? AND author = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(repoSlug, author);
    const authorPatterns = d.prepare(`
      SELECT f.category, COUNT(*) as cnt
      FROM findings f JOIN reviews r ON r.id = f.review_id
      WHERE r.repo_slug = ? AND r.author = ?
      GROUP BY f.category ORDER BY cnt DESC LIMIT 3
    `).all(repoSlug, author);
    authorProfile = {
      totalPRs: authorReviews.length,
      avgRisk: authorReviews.length
        ? (authorReviews.reduce((s, r) => s + (r.risk_score || 0), 0) / authorReviews.length).toFixed(1)
        : null,
      commonPatterns: authorPatterns,
    };
  }

  // File stats
  const flaggedFiles = d.prepare(`
    SELECT file_path, flag_count, last_flagged
    FROM file_stats WHERE repo_slug = ? AND file_path IN (${filePaths.length ? filePaths.map(() => "?").join(",") : "''"})
    ORDER BY flag_count DESC
  `).all(repoSlug, ...filePaths);

  return {
    repoSlug,
    totalReviews: recentReviews.length,
    avgRisk,
    topPatterns,
    fileHistory,
    flaggedFiles,
    authorProfile,
  };
}

function buildContextBlock(memCtx) {
  if (!memCtx || memCtx.totalReviews === 0) return "";

  const lines = [
    "--- SHARINGAN MEMORY CONTEXT ---",
    "",
    `REPO: ${memCtx.repoSlug}`,
  ];
  if (memCtx.avgRisk) lines.push(`Avg Risk: ${memCtx.avgRisk}/10 | Total Reviews: ${memCtx.totalReviews}`);

  if (memCtx.topPatterns?.length > 0) {
    lines.push("", "TOP RECURRING ISSUES IN THIS REPO:");
    for (const p of memCtx.topPatterns) {
      const signal = p.avg_weight > 0.7 ? "high signal" : p.avg_weight > 0.4 ? "medium signal" : "low signal";
      lines.push(`  • ${p.category} (${p.cnt} occurrences, ${signal})`);
    }
  }

  if (memCtx.authorProfile) {
    lines.push("", `AUTHOR: ${memCtx.repoSlug.includes("/") ? "" : ""}@developer`);
    lines.push(`  Past PRs reviewed: ${memCtx.authorProfile.totalPRs} | Avg risk: ${memCtx.authorProfile.avgRisk ?? "N/A"}/10`);
    if (memCtx.authorProfile.commonPatterns?.length > 0) {
      lines.push(`  Common patterns: ${memCtx.authorProfile.commonPatterns.map(p => `${p.category} (${p.cnt}x)`).join(", ")}`);
    }
  }

  if (memCtx.flaggedFiles?.length > 0) {
    lines.push("", "FREQUENTLY FLAGGED FILES:");
    for (const f of memCtx.flaggedFiles.slice(0, 3)) {
      lines.push(`  ${f.file_path} — flagged ${f.flag_count} times`);
    }
  }

  if (memCtx.fileHistory?.length > 0) {
    lines.push("", "RELEVANT FILE HISTORY:");
    const grouped = {};
    for (const h of memCtx.fileHistory.slice(0, 10)) {
      if (!grouped[h.file_path]) grouped[h.file_path] = [];
      grouped[h.file_path].push(h);
    }
    for (const [fp, items] of Object.entries(grouped).slice(0, 3)) {
      lines.push(`  ${fp}:`);
      for (const item of items.slice(0, 2)) {
        const date = item.created_at?.slice(0, 10) ?? "";
        lines.push(`    • ${date}: "${item.description}" [${item.severity ?? "info"}, ${item.outcome}]`);
      }
    }
  }

  lines.push("", "--- END MEMORY CONTEXT ---");
  return lines.join("\n");
}

function _updateRepoProfile(repoSlug) {
  // Lightweight — patterns.json updated by queryMemoryContext at review time
}

function _updateAuthorProfile(author, repoSlug, riskScore) {
  // Author profiles tracked in SQLite via query; JSON files optional future enhancement
}

function getStats(workingDir) {
  try {
    const d = getDb();
    const reviewCount = d.prepare("SELECT COUNT(*) as n FROM reviews").get().n;
    const memDir = path.join(workingDir, "memory");
    let sizeBytes = 0;
    const dbPath = path.join(memDir, "index.db");
    if (fs.existsSync(dbPath)) sizeBytes += fs.statSync(dbPath).size;
    const lastReview = d.prepare("SELECT created_at FROM reviews ORDER BY created_at DESC LIMIT 1").get();
    return { reviewCount, sizeBytes, lastReview: lastReview?.created_at ?? null };
  } catch {
    return { reviewCount: 0, sizeBytes: 0, lastReview: null };
  }
}

function clearAll(workingDir) {
  try {
    const d = getDb();
    d.exec("DELETE FROM findings; DELETE FROM file_stats; DELETE FROM reviews;");
    const embDir = path.join(workingDir, "memory", "embeddings");
    if (fs.existsSync(embDir)) {
      for (const f of fs.readdirSync(embDir)) fs.unlinkSync(path.join(embDir, f));
    }
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = { init, saveReview, updateOutcome, queryMemoryContext, buildContextBlock, getStats, clearAll, close };

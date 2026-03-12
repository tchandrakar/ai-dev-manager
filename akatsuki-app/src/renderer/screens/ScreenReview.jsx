import { useState, useEffect, useRef } from "react";
import { T, riskColor, severityColor } from "../tokens";
import { Btn, Dot, Spinner, StatusPill } from "../components";
import { useApp, useAgents, useGitConnections, useWorkingDir, useActivePR } from "../store/AppContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDiff(raw) {
  if (!raw) return [];
  const files = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) {
      cur = { header: line, path: "", hunks: [], status: "modified", additions: 0, deletions: 0 };
      files.push(cur);
    } else if (cur) {
      if (line.startsWith("+++ b/")) cur.path = line.slice(6);
      else if (line.startsWith("new file")) cur.status = "added";
      else if (line.startsWith("deleted file")) cur.status = "deleted";
      else if (line.startsWith("+") && !line.startsWith("+++")) { cur.additions++; cur.hunks.push(line); }
      else if (line.startsWith("-") && !line.startsWith("---")) { cur.deletions++; cur.hunks.push(line); }
      else cur.hunks.push(line);
    }
  }
  return files;
}

function parseAIResponse(text) {
  try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
  return { riskScore: 5, summary: text, findings: [], reviewText: text };
}

function detectPlatform(url) {
  if (/github\.com/i.test(url))    return "github";
  if (/bitbucket\.org/i.test(url)) return "bitbucket";
  if (/gitlab\.com/i.test(url))    return "gitlab";
  return "github";
}

function fileStatusColor(s) {
  return { added: T.green, deleted: T.red, modified: T.amber }[s] ?? T.blue;
}

// ── Panel Header ──────────────────────────────────────────────────────────────
function PH({ accent, title, children, style }) {
  return (
    <div style={{ height: 36, background: T.bg1, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", flexShrink: 0, ...style }}>
      <div style={{ width: 3, height: 36, background: accent, flexShrink: 0 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, padding: "0 10px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.txt, textTransform: "uppercase" }}>{title}</span>
        {children}
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ prData, onRunReview, reviewing, workingDir }) {
  const hasDir = !!workingDir;
  return (
    <div style={{ height: 44, background: T.bg2, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, WebkitAppRegion: "drag" }}>
      {!hasDir && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: `${T.amber}14`, border: `1px solid ${T.amber}40`, borderRadius: 5, fontSize: 11, color: T.amber, WebkitAppRegion: "no-drag" }}>
          ⚠ Working directory not set — configure in Settings
        </div>
      )}

      {prData && (
        <div style={{ display: "flex", gap: 6, WebkitAppRegion: "no-drag" }}>
          <div style={{ padding: "2px 10px", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, fontSize: 10, color: T.cyan, fontFamily: T.fontMono }}>
            ⎇  {prData.branch}
          </div>
          <div style={{ padding: "2px 10px", background: `${T.blue}14`, border: `1px solid ${T.blue}30`, borderRadius: 4, fontSize: 10, color: T.blue, fontWeight: 600 }}>
            PR #{prData.number}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" }}>
        <Btn variant="primary" onClick={onRunReview} disabled={!hasDir || reviewing}>
          {reviewing ? <><Spinner size={12} color="#fff" /> Reviewing…</> : "▶  Run AI Review"}
        </Btn>
        <Btn variant="success" disabled={!prData}>✓  Approve</Btn>
        <Btn variant="danger" disabled={!prData}>✗  Request Changes</Btn>
      </div>
    </div>
  );
}

// ── PR URL bar ────────────────────────────────────────────────────────────────
function PRUrlBar({ onLoad, onClear, loading, savedUrl, hasPR }) {
  const [url, setUrl] = useState(savedUrl ?? "");
  // Sync if parent restores a saved URL after mount
  const prevSaved = useRef(savedUrl);
  useEffect(() => {
    if (savedUrl && savedUrl !== prevSaved.current) {
      setUrl(savedUrl);
      prevSaved.current = savedUrl;
    }
  }, [savedUrl]);
  return (
    <div style={{ padding: "7px 16px", borderBottom: `1px solid ${T.border}`, background: T.bg1, display: "flex", gap: 8, flexShrink: 0 }}>
      <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && onLoad(url)}
        placeholder="Paste a PR URL — github.com/.../pull/N  ·  bitbucket.org/.../pull-requests/N  ·  gitlab.com/.../-/merge_requests/N"
        style={{ flex: 1, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.txt, fontSize: 12, fontFamily: T.fontUI, padding: "5px 12px", outline: "none" }}/>
      <Btn variant="ghost" onClick={() => onLoad(url)} disabled={loading || !url.trim()}>
        {loading ? <Spinner size={12} /> : "Load PR"}
      </Btn>
      {hasPR && !loading && (
        <Btn variant="danger" onClick={onClear} style={{ padding: "0 10px" }} title="Clear loaded PR">
          × Clear
        </Btn>
      )}
    </div>
  );
}

// ── PR Header ─────────────────────────────────────────────────────────────────
function PRHeader({ prData, hasReview }) {
  if (!prData) return (
    <div style={{ height: 76, background: T.bg1, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 24px", flexShrink: 0 }}>
      <span style={{ fontSize: 13, color: T.txt3 }}>Paste a GitHub, Bitbucket, or GitLab PR URL above to load a pull request</span>
    </div>
  );
  return (
    <div style={{ minHeight: 76, background: T.bg1, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: T.txt }}>{prData.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 9, fontSize: 10, fontWeight: 600, background: `${T.green}18`, border: `1px solid ${T.green}40`, color: T.green }}>
          <Dot color={T.green} size={5} /> Open
        </span>
        <span style={{ color: T.txt2 }}>{prData.author}</span>
        <span style={{ color: T.txt3 }}>•</span>
        <span style={{ color: T.txt2 }}>{prData.changedFiles ?? "?"} files</span>
        {prData.additions != null && <><span style={{ color: T.txt3 }}>•</span><span style={{ color: T.green }}>+{prData.additions}</span><span style={{ color: T.red }}>−{prData.deletions}</span></>}
        {hasReview && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 9, fontSize: 10, fontWeight: 600, background: `${T.purple}18`, border: `1px solid ${T.purple}30`, color: T.purple }}>
            ✦ AI Reviewed
          </span>
        )}
      </div>
    </div>
  );
}

// ── Files Sidebar ─────────────────────────────────────────────────────────────
function FilesSidebar({ files, active, onSelect }) {
  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);
  return (
    <div style={{ width: 220, background: T.bg2, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <PH accent={T.purple} title="Files Changed">
        <span style={{ fontSize: 10, color: T.txt3, background: T.bg3, padding: "1px 6px", borderRadius: 8 }}>{files.length}</span>
      </PH>
      <div style={{ flex: 1, overflow: "auto" }}>
        {files.length === 0 && (
          <div style={{ padding: "24px 14px", fontSize: 11, color: T.txt3, textAlign: "center", lineHeight: 1.6 }}>Load a PR to see changed files</div>
        )}
        {files.map(f => {
          const isActive = active === f.path;
          const sc = fileStatusColor(f.status);
          return (
            <div key={f.path} onClick={() => onSelect(f.path)} style={{ display: "flex", alignItems: "center", height: 32, cursor: "pointer", background: isActive ? T.bg3 : "transparent", borderLeft: `3px solid ${isActive ? T.blue : "transparent"}`, paddingLeft: isActive ? 9 : 12, paddingRight: 8, gap: 8, borderBottom: `1px solid ${T.border}20` }}>
              <Dot color={sc} size={8} />
              <span style={{ flex: 1, fontSize: 12, fontFamily: T.fontMono, color: isActive ? T.txt : "#C9D1D9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.path.split("/").pop()}
              </span>
              <span style={{ fontSize: 10, color: sc, fontWeight: 600, flexShrink: 0 }}>+{f.additions} −{f.deletions}</span>
            </div>
          );
        })}
        {files.length > 0 && (
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.txt3, marginBottom: 4 }}>{files.length} files changed</div>
            <div style={{ fontSize: 11, color: T.green }}>+{totalAdd} additions</div>
            <div style={{ fontSize: 11, color: T.red }}>−{totalDel} deletions</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diff Line ─────────────────────────────────────────────────────────────────
function DiffLine({ line, lineNum, highlighted, highlightColor }) {
  const isAdded   = line.startsWith("+") && !line.startsWith("+++");
  const isRemoved = line.startsWith("-") && !line.startsWith("---");
  const isHunk    = line.startsWith("@@");
  const baseBg    = isAdded ? "#3FB95010" : isRemoved ? "#F8514910" : isHunk ? T.bg3 : T.bg0;
  const hlBg      = highlighted ? `${highlightColor ?? T.amber}14` : baseBg;
  return (
    <div style={{
      display: "flex", alignItems: "stretch", minHeight: 22,
      background: hlBg,
      borderLeft: `3px solid ${highlighted ? (highlightColor ?? T.amber) : isAdded ? T.green : isRemoved ? T.red : isHunk ? T.blue : "transparent"}`,
    }}>
      <span style={{ width: 36, padding: "1px 6px 1px 0", color: isAdded ? `${T.green}70` : isRemoved ? `${T.red}70` : T.txt3, fontSize: 11, fontFamily: T.fontMono, textAlign: "right", flexShrink: 0, borderRight: `1px solid ${T.border}`, userSelect: "none" }}>{lineNum}</span>
      {!isHunk && (
        <span style={{ width: 14, textAlign: "center", fontSize: 12, fontFamily: T.fontMono, color: isAdded ? T.green : isRemoved ? T.red : "transparent", flexShrink: 0 }}>{isAdded ? "+" : isRemoved ? "−" : " "}</span>
      )}
      <span style={{ padding: "1px 12px 1px 4px", flex: 1, fontSize: 11, fontFamily: T.fontMono, whiteSpace: "pre-wrap", wordBreak: "break-all", color: isAdded ? T.green : isRemoved ? "#FF7B72" : isHunk ? T.txt2 : "#8B949E" }}>
        {line}
      </span>
    </div>
  );
}

// ── Inline AI Comment ─────────────────────────────────────────────────────────
function InlineComment({ finding }) {
  const sc = severityColor(finding.severity);
  return (
    <div style={{
      margin: "2px 0 4px 0", background: `${sc}08`,
      border: `1px solid ${sc}30`, borderLeft: `3px solid ${sc}`,
      padding: "8px 12px 10px 12px",
      animation: "slideIn 0.15s ease-out",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: sc }}>AI · {finding.category ?? "review"}</span>
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: `${sc}18`, border: `1px solid ${sc}40`, color: sc, fontWeight: 600 }}>{finding.severity}</span>
        {finding.lineStart && (
          <span style={{ fontSize: 10, color: T.txt3, marginLeft: "auto", fontFamily: T.fontMono }}>line {finding.lineStart}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: T.txt, lineHeight: 1.55, marginBottom: finding.suggestion ? 8 : 0 }}>{finding.description}</div>
      {finding.suggestion && (
        <div style={{ fontSize: 11, color: T.txt2, borderTop: `1px solid ${sc}20`, paddingTop: 6, marginTop: 6, lineHeight: 1.5 }}>
          <span style={{ color: sc, fontWeight: 600 }}>💡 Suggestion: </span>{finding.suggestion}
        </div>
      )}
    </div>
  );
}

// ── Diff Panel ────────────────────────────────────────────────────────────────
function DiffPanel({ files, active, findings }) {
  const file = files.find(f => f.path === active) ?? files[0];
  if (!file) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg0 }}>
      <div style={{ textAlign: "center", color: T.txt3 }}><div style={{ fontSize: 32, opacity: 0.2, marginBottom: 8 }}>±</div><div style={{ fontSize: 12 }}>Load a PR to see the diff</div></div>
    </div>
  );

  // Compute actual new-file line numbers for each hunk entry.
  // This is what the AI reports as lineStart — actual file line numbers, not diff positions.
  // @@ -oldStart,oldCount +newStart,newCount @@ → newStart tells us the first line number.
  // Context lines (+) and added lines increment the counter; removed lines (-) do NOT
  // (they don't exist in the new file).
  const hunkLineNums = []; // parallel array: null for @@ headers and removed lines
  let curLine = 0;
  for (const hunkLine of file.hunks) {
    if (hunkLine.startsWith("@@")) {
      const m = hunkLine.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (m) curLine = parseInt(m[1], 10);
      hunkLineNums.push(null); // hunk header has no file line number
    } else if (hunkLine.startsWith("-") && !hunkLine.startsWith("---")) {
      hunkLineNums.push(null); // removed line — no new-file line number
      // curLine does NOT increment
    } else {
      // context line or added line — exists in the new file
      hunkLineNums.push(curLine);
      curLine++;
    }
  }

  // Pre-compute: hunk index → findings[], matched by actual file line number
  const filefindings = (findings ?? []).filter(f => f.filePath === file.path);
  const findingMap = new Map();
  filefindings.forEach(f => {
    if (!f.lineStart) return;
    // Find the hunk index whose actual file line number is closest to f.lineStart
    let bestIdx = -1;
    let bestDist = Infinity;
    hunkLineNums.forEach((lineNum, idx) => {
      if (lineNum == null) return;
      const dist = Math.abs(lineNum - f.lineStart);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    if (bestIdx >= 0 && bestDist < 5) { // up to ±4 lines tolerance for AI imprecision
      if (!findingMap.has(bestIdx)) findingMap.set(bestIdx, []);
      findingMap.get(bestIdx).push(f);
    }
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg0 }}>
      <PH accent={T.blue} title="Code Diff" style={{ background: T.bg1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontMono }}>{file.path}</span>
          {file.additions > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${T.green}18`, border: `1px solid ${T.green}30`, color: T.green, fontWeight: 600 }}>+{file.additions}</span>}
          {file.deletions > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${T.red}18`, border: `1px solid ${T.red}30`, color: T.red, fontWeight: 600 }}>−{file.deletions}</span>}
          {filefindings.length > 0 && (
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${T.amber}18`, border: `1px solid ${T.amber}30`, color: T.amber, fontWeight: 600 }}>
              {filefindings.length} comment{filefindings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </PH>
      <div style={{ flex: 1, overflow: "auto" }}>
        {file.hunks.map((line, i) => {
          const lineFindings = findingMap.get(i) ?? [];
          const hlColor = lineFindings.length > 0 ? severityColor(lineFindings[0].severity) : undefined;
          const displayLineNum = hunkLineNums[i] ?? "";
          return (
            <div key={i}>
              <DiffLine line={line} lineNum={displayLineNum} highlighted={lineFindings.length > 0} highlightColor={hlColor} />
              {lineFindings.map((f, fi) => <InlineComment key={fi} finding={f} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Review Output ─────────────────────────────────────────────────────────────
function ReviewOutput({ review, reviewId, prData, prUrl, onDiscard }) {
  const { connections } = useGitConnections();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  if (!review) return null;
  const rc = riskColor(review.riskScore);
  const platform = detectPlatform(prUrl ?? "");
  const platformLabel = { github: "GitHub", bitbucket: "Bitbucket", gitlab: "GitLab" }[platform] ?? "Git";

  async function handlePost() {
    setPosting(true);
    const conn = connections[platform] ?? {};
    const token = conn.token ?? "";
    const email = conn.email ?? "";
    if (!token) { alert(`No ${platformLabel} token configured in Settings`); setPosting(false); return; }
    const body = editing ? editText : review.reviewText;
    const result = await window.akatsuki.git.postReview({ url: prUrl, token, email, body });
    if (result.ok) {
      setPosted(true);
      if (reviewId) await window.akatsuki.memory.updateOutcome(reviewId, "posted");
    }
    setPosting(false);
  }

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0 }}>
      <PH accent={T.green} title="Review Output">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: T.green, background: `${T.green}14`, border: `1px solid ${T.green}30`, padding: "2px 8px", borderRadius: 9, display: "flex", alignItems: "center", gap: 4 }}>
            <Dot color={T.green} size={4} /> Saved locally
          </span>
          <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>./reviews/pr-{prData?.number}.md</span>
        </div>
      </PH>
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 6 }}>
          <div style={{ padding: "10px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.txt, marginBottom: 2 }}>
              AI Review — PR #{prData?.number} · {prData?.title}
            </div>
            <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, marginBottom: 8 }}>
              {review.model ?? "AI model"} · Risk Score: <span style={{ color: rc }}>{review.riskScore}/10</span> · {review.findings?.length ?? 0} findings
            </div>
            <div style={{ width: "100%", height: 1, background: T.border, marginBottom: 8 }} />
            {editing ? (
              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                style={{ width: "100%", minHeight: 100, background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 4, color: T.txt, fontSize: 11, fontFamily: T.fontUI, padding: "6px 8px", outline: "none", resize: "vertical" }} />
            ) : (
              <div style={{ fontSize: 11, color: "#C9D1D9", lineHeight: 1.6, maxHeight: 100, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {review.reviewText?.slice(0, 500)}{review.reviewText?.length > 500 ? "…" : ""}
              </div>
            )}
          </div>
          <div style={{ height: 1, background: T.border }} />
          <div style={{ height: 44, background: T.bg2, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderRadius: "0 0 6px 6px" }}>
            <Btn variant="primary" onClick={handlePost} disabled={posting || posted}>
              {posting ? <><Spinner size={12} color="#fff" /> Posting…</> : posted ? "✓ Posted" : `↑  Post to ${platformLabel}`}
            </Btn>
            {!editing && <Btn variant="ghost" onClick={() => { setEditText(review.reviewText ?? ""); setEditing(true); }}>✎  Modify</Btn>}
            {editing && <Btn variant="ghost" onClick={() => setEditing(false)}>✕  Cancel</Btn>}
            <Btn variant="danger" onClick={onDiscard}>✗  Discard</Btn>
            {prData && <span style={{ fontSize: 11, color: T.txt3, marginLeft: 8 }}>→ {prData.repoSlug} · PR #{prData.number}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Review Panel ───────────────────────────────────────────────────────────
function AIReviewPanel({ review }) {
  if (!review) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ textAlign: "center", color: T.txt3, fontSize: 11 }}>
        <div style={{ fontSize: 24, opacity: 0.2, marginBottom: 8 }}>◉</div>Run AI Review to see findings
      </div>
    </div>
  );
  const rc = riskColor(review.riskScore);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
      {/* Risk Score */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: T.txt2, marginBottom: 4 }}>Risk Score</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: rc, fontFamily: T.fontMono, lineHeight: 1 }}>{review.riskScore}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.txt3 }}>/10</span>
        </div>
        <div style={{ height: 4, background: T.bg3, borderRadius: 2, marginBottom: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(review.riskScore / 10) * 100}%`, background: rc, borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: T.txt2 }}>● {review.riskScore >= 7 ? "High" : review.riskScore >= 4 ? "Medium" : "Low"} Risk</div>
      </div>
      <div style={{ height: 1, background: T.border, margin: "10px 0" }} />

      {/* Findings */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.txt, textTransform: "uppercase", marginBottom: 8 }}>Findings</div>
      {review.findings?.map((f, i) => {
        const sc = severityColor(f.severity);
        return (
          <div key={i} style={{ padding: "8px 10px", background: `${sc}10`, border: `1px solid ${sc}30`, borderRadius: 6, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Dot color={sc} size={8} />
                <span style={{ fontSize: 12, fontWeight: 600, color: sc }}>{f.category}</span>
              </div>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${sc}20`, border: `1px solid ${sc}40`, color: sc, fontWeight: 600 }}>{f.severity}</span>
            </div>
            <div style={{ fontSize: 10, color: T.txt2 }}>{f.description?.slice(0, 80)}</div>
          </div>
        );
      })}

      {review.summary && (
        <>
          <div style={{ height: 1, background: T.border, margin: "10px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.txt, textTransform: "uppercase", marginBottom: 6 }}>Summary</div>
          <div style={{ fontSize: 11, color: T.txt2, lineHeight: 1.6 }}>{review.summary}</div>
        </>
      )}
    </div>
  );
}

// ── AI Chat Panel ─────────────────────────────────────────────────────────────
function ChatPanel({ messages, onSend, prData }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const { getActiveAgent } = useAgents();

  async function send() {
    if (!input.trim() || sending) return;
    const msg = input.trim(); setInput(""); setSending(true);
    onSend({ role: "user", content: msg });
    const agent = getActiveAgent();
    if (!agent) { onSend({ role: "assistant", content: "No AI agent configured. Add an API key in Settings." }); setSending(false); return; }
    const r = await window.akatsuki.ai.chat({ messages: [{ role: "user", content: msg }], provider: agent.provider, apiKey: agent.apiKey, model: agent.model });
    onSend({ role: "assistant", content: r.error ? `Error: ${r.error}` : r.text });
    setSending(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Context bar */}
      {prData && (
        <div style={{ margin: "8px 14px", padding: "5px 10px", background: T.bg3, borderRadius: 5, fontSize: 11, color: T.txt2 }}>
          Context: {prData.repoSlug}
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 11, color: T.txt3, textAlign: "center", marginTop: 24 }}>Ask about this PR…</div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            padding: "7px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
            background: m.role === "user" ? T.bg3 : `${T.purple}0D`,
            border: `1px solid ${m.role === "user" ? T.border2 : `${T.purple}1A`}`,
            color: T.txt, maxWidth: "90%", alignSelf: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            {m.role === "assistant" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Dot color={T.purple} size={10} />
                <span style={{ fontSize: 11, fontWeight: 700, color: T.purple }}>AI</span>
              </div>
            )}
            {m.content}
          </div>
        ))}
        {sending && <div style={{ display: "flex", gap: 6, padding: "4px 8px" }}><Spinner size={12} /><span style={{ fontSize: 11, color: T.txt3 }}>Thinking…</span></div>}
      </div>
      {/* Chat input */}
      <div style={{ height: 40, background: T.bg2, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 8px", gap: 8, flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about this PR..."
          style={{ flex: 1, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.txt, fontSize: 11, fontFamily: T.fontUI, padding: "4px 10px", outline: "none" }} />
        <Btn variant="primary" onClick={send} disabled={!input.trim() || sending} style={{ padding: "0 12px", height: 26 }}>Send</Btn>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ScreenReview({ onReviewSaved }) {
  const { workingDir } = useWorkingDir();
  const { getActiveAgent } = useAgents();
  const { connections } = useGitConnections();
  const { activePR, setActivePR, clearActivePR } = useActivePR();

  const [prUrl, setPrUrlState] = useState(activePR?.prUrl ?? "");
  const [prData, setPrData] = useState(activePR?.prData ?? null);
  const [diffFiles, setDiffFiles] = useState(activePR?.diffFiles ?? []);
  const [activeFile, setActiveFile] = useState(activePR?.activeFile ?? "");
  const [loadingPR, setLoadingPR] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [aiReview, setAiReview] = useState(activePR?.aiReview ?? null);
  const [reviewId, setReviewId] = useState(activePR?.reviewId ?? null);
  const [reviewFileBase, setReviewFileBase] = useState(activePR?.reviewFileBase ?? null);
  const [chatMessages, setChatMessages] = useState(activePR?.chatMessages ?? []);
  const [statusMsg, setStatusMsg] = useState("");

  // Persist PR session to context (+ debounced localStorage) whenever key state changes.
  // diffFiles is stripped from localStorage by persistence.js (too large), but lives in
  // AppContext memory for same-session navigation.
  useEffect(() => {
    if (prData) {
      setActivePR({ prUrl, prData, diffFiles, activeFile, aiReview, reviewId, reviewFileBase, chatMessages });
    }
  }, [prUrl, prData, diffFiles, activeFile, aiReview, reviewId, reviewFileBase, chatMessages]);

  // On mount: if PR metadata was restored from storage but diff is missing (stripped to save
  // localStorage quota, or user navigated away mid-load), silently re-fetch the diff.
  useEffect(() => {
    if (!prData || !prUrl || diffFiles.length > 0) return;
    const platform = detectPlatform(prUrl);
    const conn = connections[platform] ?? {};
    setLoadingPR(true);
    setStatusMsg("Restoring diff…");
    window.akatsuki.git
      .fetchDiff({ url: prUrl, token: conn.token ?? "", email: conn.email ?? "" })
      .then(({ diff, error }) => {
        if (error) { setStatusMsg(`Could not restore diff: ${error}`); setLoadingPR(false); return; }
        const files = parseDiff(diff || "");
        setDiffFiles(files);
        if (files.length > 0 && !activeFile) setActiveFile(files[0].path);
        setStatusMsg(`PR #${prData.number} restored · ${files.length} files`);
        setLoadingPR(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally mount-only

  async function handleClearPR() {
    if (reviewId) await window.akatsuki.memory.updateOutcome(reviewId, "discarded").catch(() => {});
    if (workingDir && reviewFileBase && prData)
      await window.akatsuki.review.deleteFile({ workingDir, repoSlug: prData.repoSlug.replace("/", "-"), base: reviewFileBase }).catch(() => {});
    setPrUrlState(""); setPrData(null); setDiffFiles([]); setActiveFile("");
    setAiReview(null); setReviewId(null); setReviewFileBase(null); setChatMessages([]);
    clearActivePR();
    setStatusMsg("PR cleared");
  }

  async function handleLoadPR(url) {
    if (!url.trim()) return;
    setPrUrlState(url);
    setLoadingPR(true);
    setStatusMsg("Fetching PR…");
    const platform = detectPlatform(url);
    const conn = connections[platform] ?? {};
    const token = conn.token ?? "";
    const email = conn.email ?? "";
    const pr = await window.akatsuki.git.fetchPR({ url: url.trim(), token, email });
    if (pr.error) { setStatusMsg(`Error: ${pr.error}`); setLoadingPR(false); return; }
    setPrData(pr);
    const { diff } = await window.akatsuki.git.fetchDiff({ url: url.trim(), token, email });
    const files = parseDiff(diff || "");
    setDiffFiles(files);
    if (files.length > 0) setActiveFile(files[0].path);
    setAiReview(null); setReviewId(null); setChatMessages([]);
    setStatusMsg(`PR #${pr.number} loaded · ${files.length} files`);
    setLoadingPR(false);
  }

  async function handleRunReview() {
    if (!prData || reviewing) return;
    const agent = getActiveAgent();
    if (!agent) { setStatusMsg("No AI agent configured — add an API key in Settings"); return; }
    setReviewing(true);
    setStatusMsg("Querying memory context…");
    const filePaths = diffFiles.map(f => f.path);
    const memCtx = await window.akatsuki.memory.queryContext({ repoSlug: prData.repoSlug, author: prData.author, filePaths });
    const memBlock = await window.akatsuki.memory.buildContextBlock(memCtx);
    setStatusMsg("Running AI review…");
    const rawDiff = diffFiles.flatMap(f => [f.header, ...f.hunks]).join("\n");
    const result = await window.akatsuki.ai.review({ diff: rawDiff.slice(0, 60000), memoryContext: memBlock, provider: agent.provider, apiKey: agent.apiKey, model: agent.model });
    if (result.error) { setStatusMsg(`AI error: ${result.error}`); setReviewing(false); return; }
    const parsed = parseAIResponse(result.text ?? "");
    parsed.model = agent.model;
    setAiReview(parsed);
    const saved = await window.akatsuki.memory.saveReview({ repoSlug: prData.repoSlug, prNumber: prData.number, prTitle: prData.title, author: prData.author, branch: prData.branch, riskScore: parsed.riskScore, model: agent.model, tokenCount: (result.inputTokens ?? 0) + (result.outputTokens ?? 0), reviewText: parsed.reviewText, findings: parsed.findings, prUrl });
    setReviewId(saved.id);
    if (workingDir) {
      const fr = await window.akatsuki.review.saveFile({ workingDir, repoSlug: prData.repoSlug.replace("/", "-"), prNumber: prData.number, content: parsed.reviewText, meta: { ...parsed, prData, model: agent.model } });
      setReviewFileBase(fr.base);
    }
    setStatusMsg(`Review complete · Risk ${parsed.riskScore}/10 · ${parsed.findings?.length ?? 0} findings`);
    setReviewing(false);
    if (onReviewSaved) onReviewSaved(); // refresh History count in left nav
  }

  async function handleDiscard() {
    if (reviewId) await window.akatsuki.memory.updateOutcome(reviewId, "discarded");
    if (workingDir && reviewFileBase && prData) await window.akatsuki.review.deleteFile({ workingDir, repoSlug: prData.repoSlug.replace("/", "-"), base: reviewFileBase });
    setAiReview(null); setReviewId(null); setReviewFileBase(null); setStatusMsg("Review discarded");
    // Update persisted session — keep PR loaded, just clear the review
    if (prData) setActivePR({ prUrl, prData, diffFiles, activeFile, aiReview: null, reviewId: null, reviewFileBase: null, chatMessages });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg0, fontFamily: T.fontUI, overflow: "hidden" }}>
      <Navbar prData={prData} onRunReview={handleRunReview} reviewing={reviewing} workingDir={workingDir} />
      <PRUrlBar onLoad={handleLoadPR} onClear={handleClearPR} loading={loadingPR} savedUrl={prUrl} hasPR={!!prData} />
      <PRHeader prData={prData} hasReview={!!aiReview} />

      {/* Main 4-column layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <FilesSidebar files={diffFiles} active={activeFile} onSelect={setActiveFile} />

        {/* Center: diff + review output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <DiffPanel files={diffFiles} active={activeFile} findings={aiReview?.findings} />
          <ReviewOutput review={aiReview} reviewId={reviewId} prData={prData} prUrl={prUrl} onDiscard={handleDiscard} />
        </div>

        {/* AI Review */}
        <div style={{ width: 260, background: T.bg2, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <PH accent={T.amber} title="AI Review" />
          <AIReviewPanel review={aiReview} />
        </div>

        {/* AI Chat */}
        <div style={{ width: 340, background: T.bg1, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <PH accent={T.purple} title="AI Assistant">
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: `${T.purple}18`, border: `1px solid ${T.purple}30`, color: T.purple }}>Code Reviewer</span>
          </PH>
          <ChatPanel messages={chatMessages} onSend={m => setChatMessages(p => [...p, m])} prData={prData} />
        </div>
      </div>

      {/* Status bar */}
      <div style={{ height: 20, background: T.bg2, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
        <Dot color={T.green} size={6} />
        {prData ? (
          <span style={{ fontSize: 10, color: T.txt3 }}>{prData.baseBranch} ← {prData.branch}</span>
        ) : (
          <span style={{ fontSize: 10, color: T.txt3 }}>◎ Akatsuki · Sharingan</span>
        )}
        <span style={{ fontSize: 10, color: T.border }}>|</span>
        {aiReview && <span style={{ fontSize: 10, color: T.txt3 }}>{aiReview.model}</span>}
        {workingDir && <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>⊕ {workingDir}</span>}
        {statusMsg && <span style={{ fontSize: 10, color: T.txt2, marginLeft: "auto" }}>{statusMsg}</span>}
      </div>
    </div>
  );
}

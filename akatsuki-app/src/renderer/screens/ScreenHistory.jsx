import { useState, useEffect, useCallback } from "react";
import { T, riskColor, severityColor } from "../tokens";
import { Dot, Btn, Spinner } from "../components";
import { useApp, useGitConnections, useActivePR } from "../store/AppContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function riskLabel(score) {
  if (score == null) return "Unknown";
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}
function outcomeColor(o) {
  return { posted: T.green, discarded: T.txt3, modified: T.blue, pending: T.amber, archived: T.txt3 }[o] ?? T.txt3;
}
function outcomeLabel(o) {
  return { posted: "Posted", discarded: "Discarded", modified: "Modified", pending: "Pending", archived: "Archived" }[o] ?? o ?? "Pending";
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function fmtRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Review Row ────────────────────────────────────────────────────────────────
function ReviewRow({ review, selected, checked, multiSelect, onSelect, onCheck }) {
  const rc = riskColor(review.risk_score);
  const oc = outcomeColor(review.outcome);
  const repo = (review.repo_slug ?? "").split("/").pop();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => multiSelect ? onCheck(review.id) : onSelect(review)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "11px 16px", borderBottom: `1px solid ${T.border}`,
        cursor: "pointer", userSelect: "none",
        background: selected ? `${T.purple}10` : hovered ? `${T.bg3}80` : "transparent",
        borderLeft: `3px solid ${selected ? T.purple : "transparent"}`,
        display: "flex", alignItems: "flex-start", gap: 10,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      {/* Checkbox — always shown in multi-select, on hover otherwise */}
      {(multiSelect || hovered || checked) && (
        <div
          onClick={e => { e.stopPropagation(); onCheck(review.id); }}
          style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2, cursor: "pointer",
            border: `1.5px solid ${checked ? T.purple : T.border2}`,
            background: checked ? T.purple : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.12s ease",
          }}
        >
          {checked && <span style={{ fontSize: 10, color: "#fff", lineHeight: 1 }}>✓</span>}
        </div>
      )}
      {!multiSelect && !hovered && !checked && <div style={{ width: 16, flexShrink: 0 }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: title + risk */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {review.pr_title || `PR #${review.pr_number}`}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 1, flexShrink: 0, marginLeft: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: rc, fontFamily: T.fontMono }}>{review.risk_score ?? "—"}</span>
            <span style={{ fontSize: 9, color: T.txt3 }}>/10</span>
          </div>
        </div>
        {/* Row 2: meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, flexWrap: "wrap" }}>
          <span style={{ color: T.txt3, fontFamily: T.fontMono }}>{repo}</span>
          <span style={{ color: T.border2 }}>·</span>
          <span style={{ color: T.blue }}>#{review.pr_number}</span>
          <span style={{ color: T.border2 }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: oc }}>
            <Dot color={oc} size={5} />{outcomeLabel(review.outcome)}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ color: T.txt3 }}>{fmtRelative(review.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ review, findings, onOpenInReview, loadingDetail }) {
  const rc = riskColor(review.risk_score);
  const oc = outcomeColor(review.outcome);
  const hasUrl = !!review.pr_url;

  return (
    <div style={{ padding: "24px 28px", overflow: "auto", height: "100%", animation: "fadeIn 0.2s ease-out" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.txt, lineHeight: 1.3 }}>
            {review.pr_title || `PR #${review.pr_number}`}
          </div>
          <Btn
            variant="primary"
            onClick={onOpenInReview}
            disabled={loadingDetail || !hasUrl}
            title={hasUrl ? "Open this PR in the Sharingan review screen" : "No PR URL stored — re-run to enable"}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {loadingDetail ? <><Spinner size={11} color="#fff" /> Loading…</> : "◉  Open in Sharingan"}
          </Btn>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
          <span style={{ color: T.txt2, fontFamily: T.fontMono }}>{review.repo_slug}</span>
          <span style={{ color: T.border2 }}>·</span>
          <span style={{ color: T.blue }}>PR #{review.pr_number}</span>
          {review.author && <><span style={{ color: T.border2 }}>·</span><span style={{ color: T.txt2 }}>{review.author}</span></>}
          {review.branch && <><span style={{ color: T.border2 }}>·</span><span style={{ color: T.txt3, fontFamily: T.fontMono }}>{review.branch}</span></>}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="RISK SCORE" accent={rc}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: rc, fontFamily: T.fontMono }}>{review.risk_score ?? "—"}</span>
            <span style={{ fontSize: 13, color: T.txt3 }}>/10</span>
          </div>
          <div style={{ fontSize: 10, color: rc, marginTop: 3 }}>● {riskLabel(review.risk_score)}</div>
        </StatCard>
        <StatCard label="OUTCOME" accent={oc}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <Dot color={oc} size={8} />
            <span style={{ fontSize: 15, fontWeight: 600, color: oc }}>{outcomeLabel(review.outcome)}</span>
          </div>
          <div style={{ fontSize: 10, color: T.txt3 }}>{review.model ?? "AI"}</div>
        </StatCard>
        <StatCard label="REVIEWED" accent={T.border}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txt }}>{fmtDate(review.created_at)}</div>
          <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>{fmtTime(review.created_at)}</div>
        </StatCard>
        {findings.length > 0 && (
          <StatCard label="FINDINGS" accent={T.amber}>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.amber, fontFamily: T.fontMono }}>{findings.length}</div>
            <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>inline comments</div>
          </StatCard>
        )}
      </div>

      {/* Inline Findings */}
      {findings.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.txt, textTransform: "uppercase", marginBottom: 10 }}>
            Inline Findings ({findings.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {findings.map((f, i) => {
              const sc = severityColor(f.severity);
              return (
                <div key={i} style={{
                  padding: "10px 14px", background: T.bg2,
                  border: `1px solid ${sc}25`, borderLeft: `3px solid ${sc}`,
                  borderRadius: 7, transition: "border-color 0.15s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 3, background: `${sc}18`, border: `1px solid ${sc}35`, color: sc, fontWeight: 700 }}>{f.severity}</span>
                    <span style={{ fontSize: 11, color: T.txt2, fontWeight: 600 }}>{f.category}</span>
                    {f.file_path && (
                      <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, marginLeft: "auto" }}>
                        {f.file_path.split("/").pop()}:{f.line_start || "?"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.txt, lineHeight: 1.55, marginBottom: f.suggestion ? 6 : 0 }}>{f.description}</div>
                  {f.suggestion && (
                    <div style={{ fontSize: 11, color: T.txt3, lineHeight: 1.5, borderTop: `1px solid ${T.border}`, paddingTop: 6, marginTop: 4 }}>
                      💡 {f.suggestion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review text */}
      {review.review_text && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.txt, textTransform: "uppercase", marginBottom: 10 }}>
            AI Summary
          </div>
          <div style={{
            padding: "14px 16px", background: T.bg2,
            border: `1px solid ${T.border}`, borderRadius: 8,
            fontSize: 11, color: T.txt2, lineHeight: 1.7,
            whiteSpace: "pre-wrap", fontFamily: T.fontUI,
          }}>
            {review.review_text}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, accent, children }) {
  return (
    <div style={{
      padding: "12px 16px", background: T.bg2,
      border: `1px solid ${accent}30`, borderRadius: 8, minWidth: 110,
      transition: "border-color 0.15s ease",
    }}>
      <div style={{ fontSize: 9, color: T.txt3, letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ScreenHistory() {
  const { dispatch } = useApp();
  const { connections } = useGitConnections();
  const { setActivePR } = useActivePR();

  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [findings, setFindings]     = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Multi-select / archive
  const [checked, setChecked]       = useState(new Set());
  const [archiving, setArchiving]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback((archived = showArchived) => {
    setLoading(true);
    window.akatsuki.memory.listReviews({ limit: 500, showArchived: archived })
      .then(r => { setReviews(r.reviews ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showArchived]);

  useEffect(() => { load(); }, [showArchived]);

  // When a row is selected, load its findings
  async function handleSelect(review) {
    setSelected(review);
    setFindings([]);
    setChecked(new Set());
    try {
      const detail = await window.akatsuki.memory.getReviewDetail(review.id);
      setFindings(detail.findings ?? []);
    } catch {}
  }

  function toggleCheck(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleArchive() {
    if (!checked.size) return;
    setArchiving(true);
    await window.akatsuki.memory.archiveReviews([...checked]).catch(() => {});
    setChecked(new Set());
    if (selected && checked.has(selected.id)) { setSelected(null); setFindings([]); }
    load();
    setArchiving(false);
  }

  // Open selected review in the Sharingan review screen
  async function handleOpenInReview() {
    if (!selected) return;
    setLoadingDetail(true);
    try {
      const detail = await window.akatsuki.memory.getReviewDetail(selected.id);
      const rev = detail.review ?? selected;
      const dbFindings = detail.findings ?? [];

      // Reconstruct activePR from stored data
      const prUrl = rev.pr_url || "";
      const restoredPR = {
        prUrl,
        prData: {
          title:        rev.pr_title ?? `PR #${rev.pr_number}`,
          number:       rev.pr_number,
          author:       rev.author ?? "",
          branch:       rev.branch ?? "",
          repoSlug:     rev.repo_slug ?? "",
          baseBranch:   null,
          changedFiles: null,
          additions:    null,
          deletions:    null,
        },
        diffFiles: [],   // will be auto-fetched by ScreenReview on mount
        activeFile: "",
        aiReview: {
          riskScore:  rev.risk_score,
          summary:    null,
          findings:   dbFindings.map(f => ({
            severity:    f.severity,
            category:    f.category,
            filePath:    f.file_path,
            lineStart:   f.line_start,
            lineEnd:     f.line_end,
            description: f.description,
            suggestion:  f.suggestion,
          })),
          reviewText: rev.review_text ?? "",
          model:      rev.model ?? "",
        },
        reviewId:       rev.id,
        reviewFileBase: null,
        chatMessages:   [],
      };

      setActivePR(restoredPR);
      dispatch({ type: "SET_SCREEN", payload: "review" });
    } catch (e) {
      console.error("Failed to open review:", e);
    }
    setLoadingDetail(false);
  }

  const multiSelectActive = checked.size > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg0, fontFamily: T.fontUI, overflow: "hidden", animation: "fadeIn 0.2s ease-out" }}>
      {/* Toolbar */}
      <div style={{ height: 44, background: T.bg2, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, WebkitAppRegion: "drag" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.txt }}>Sharingan — Review History</span>
        {!loading && reviews.length > 0 && (
          <span style={{ fontSize: 10, padding: "1px 8px", background: `${T.purple}18`, border: `1px solid ${T.purple}30`, borderRadius: 9, color: T.purple, fontWeight: 600 }}>
            {reviews.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Archive toolbar — appears when rows are checked */}
        <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag", alignItems: "center", transition: "opacity 0.2s ease", opacity: multiSelectActive ? 1 : 0.4 }}>
          {multiSelectActive && (
            <span style={{ fontSize: 11, color: T.txt3 }}>{checked.size} selected</span>
          )}
          <Btn
            variant="danger"
            disabled={!multiSelectActive || archiving}
            onClick={handleArchive}
          >
            {archiving ? <><Spinner size={11} color="#fff" /> Archiving…</> : "⬡  Archive selected"}
          </Btn>
        </div>
        <Btn
          variant="ghost"
          onClick={() => setShowArchived(v => !v)}
          style={{ fontSize: 11, WebkitAppRegion: "no-drag" }}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Btn>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflow: "auto", background: T.bg1 }}>
          {loading && (
            <div style={{ padding: 32, textAlign: "center", color: T.txt3, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Spinner size={14} /> Loading…
            </div>
          )}
          {!loading && reviews.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 36, opacity: 0.15, marginBottom: 14 }}>◉</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.txt2, marginBottom: 6 }}>No reviews yet</div>
              <div style={{ fontSize: 11, color: T.txt3, lineHeight: 1.6 }}>
                Load a PR from Sharingan and run an AI review to see history here.
              </div>
            </div>
          )}
          {reviews.map(r => (
            <ReviewRow
              key={r.id}
              review={r}
              selected={selected?.id === r.id}
              checked={checked.has(r.id)}
              multiSelect={multiSelectActive}
              onSelect={handleSelect}
              onCheck={toggleCheck}
            />
          ))}
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, overflow: "hidden", background: T.bg0 }}>
          {selected ? (
            <DetailPanel
              review={selected}
              findings={findings}
              onOpenInReview={handleOpenInReview}
              loadingDetail={loadingDetail}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 40, opacity: 0.10 }}>◉</div>
              <div style={{ fontSize: 12, color: T.txt3 }}>Select a review to see details</div>
              <div style={{ fontSize: 11, color: T.txt3, opacity: 0.7 }}>Click rows to select · Hover to reveal checkboxes</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

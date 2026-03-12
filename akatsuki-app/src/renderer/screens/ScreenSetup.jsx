import { useState } from "react";
import { T } from "../tokens";
import { Btn, Spinner } from "../components";
import { useApp, useWorkingDir } from "../store/AppContext";

export default function ScreenSetup() {
  const { dispatch } = useApp();
  const { setWorkingDir } = useWorkingDir();
  const [selectedPath, setSelectedPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleBrowse() {
    const result = await window.akatsuki.workdir.select();
    if (!result.canceled && result.path) setSelectedPath(result.path);
  }

  async function handleConfirm() {
    if (!selectedPath) return;
    setLoading(true);
    setError("");
    try {
      const initResult = await window.akatsuki.workdir.init(selectedPath);
      if (initResult?.error) { setError(initResult.error); setLoading(false); return; }

      const cfg = await window.akatsuki.config.load();
      await window.akatsuki.config.save({ ...cfg, workingDir: selectedPath });

      setWorkingDir(selectedPath);
      dispatch({ type: "SET_SCREEN", payload: "review" });
    } catch (e) {
      setError(e.message ?? "Failed to initialize working directory.");
    }
    setLoading(false);
  }

  return (
    <div style={{
      width: "100%", height: "100%", background: T.bg0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: T.fontUI,
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: `${T.purple}20`, border: `2px solid ${T.purple}60`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24,
        }}>
          ◎
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.txt, letterSpacing: -0.5 }}>Akatsuki</div>
          <div style={{ fontSize: 12, color: T.txt2 }}>Sharingan · AI Diff Reviewer</div>
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: 480, background: T.bg1, border: `1px solid ${T.border}`,
        borderRadius: 14, padding: 36, animation: "fadeIn 0.25s ease",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginBottom: 8 }}>
          Set Your Working Directory
        </div>
        <div style={{ fontSize: 13, color: T.txt2, lineHeight: 1.6, marginBottom: 28 }}>
          Akatsuki stores all reviews, AI memory, and configuration in a local directory you control.
          This is required before you can use the app.
        </div>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {[
            { icon: "◈", label: "Review storage", desc: "All saved reviews stay on your machine" },
            { icon: "◉", label: "AI memory index", desc: "SQLite-backed context for smarter reviews" },
            { icon: "⊕", label: "Config & secrets", desc: "API keys encrypted at rest, never sent elsewhere" },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 16, color: T.purple, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.txt }}>{label}</div>
                <div style={{ fontSize: 11, color: T.txt2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Path selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <div style={{
            flex: 1, background: T.bg3, border: `1px solid ${selectedPath ? T.border2 : T.border}`,
            borderRadius: 6, padding: "7px 12px", fontSize: 12,
            color: selectedPath ? T.txt : T.txt3, fontFamily: T.fontMono,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            cursor: "default",
          }}>
            {selectedPath || "No directory selected"}
          </div>
          <Btn variant="ghost" onClick={handleBrowse}>Browse</Btn>
        </div>

        {error && (
          <div style={{ fontSize: 11, color: T.red, marginBottom: 16, padding: "8px 12px", background: `${T.red}10`, borderRadius: 6, border: `1px solid ${T.red}30` }}>
            {error}
          </div>
        )}

        <Btn
          variant="primary"
          disabled={!selectedPath || loading}
          onClick={handleConfirm}
          style={{ width: "100%", justifyContent: "center", height: 38, fontSize: 13 }}
        >
          {loading ? <><Spinner size={14} color="#fff" /> Initializing...</> : "Confirm & Continue →"}
        </Btn>

        <div style={{ fontSize: 11, color: T.txt3, textAlign: "center", marginTop: 16 }}>
          You can change this later in Settings → Working Directory
        </div>
      </div>
    </div>
  );
}

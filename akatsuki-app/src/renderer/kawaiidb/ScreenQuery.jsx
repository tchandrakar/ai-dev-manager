import React, { useState, useRef, useCallback, useEffect } from "react";
import { T } from "../tokens";
import { PanelHeader, Btn } from "../components";
import { useKawaii } from "./KawaiiApp";
import { highlightSQL } from "./ScreenAIAnalyze";

// ── Tab button (named component — no hooks in .map) ─────────────────────────
function TabButton({ tab, isActive, tabCount, onSelect, onClose, onRename }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tab.name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== tab.name) onRename(tab.id, trimmed);
    setEditing(false);
  };

  return (
    <div
      onClick={() => onSelect(tab.id)}
      onDoubleClick={() => { setEditName(tab.name); setEditing(true); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px",
        cursor: "pointer",
        background: isActive ? T.bg1 : "transparent",
        borderRight: `1px solid ${T.border}`,
        color: isActive ? T.txt : T.txt2,
        fontWeight: isActive ? 600 : 400,
        position: "relative",
        userSelect: "none",
        transition: "background 0.12s",
        height: "100%",
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 2,
          background: isActive ? T.teal : T.txt3,
          flexShrink: 0, opacity: isActive ? 1 : 0.5,
        }}
      />
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 80, background: T.bg3, border: `1px solid ${T.teal}`,
            borderRadius: 3, color: T.txt, fontSize: 11, fontFamily: T.fontUI,
            padding: "1px 4px", outline: "none",
          }}
        />
      ) : (
        <span style={{ whiteSpace: "nowrap" }}>{tab.name}</span>
      )}
      {tabCount > 1 && (
        <span
          onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          style={{
            fontSize: 13, color: T.txt3, cursor: "pointer",
            lineHeight: 1, marginLeft: 2, padding: "0 2px",
          }}
        >
          x
        </span>
      )}
      {isActive && (
        <span style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 2, background: T.teal,
        }} />
      )}
    </div>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, onRename }) {
  return (
    <div
      style={{
        height: 30, minHeight: 30,
        display: "flex", alignItems: "stretch",
        background: T.bg2,
        borderBottom: `1px solid ${T.border}`,
        fontFamily: T.fontUI, fontSize: 11,
        overflow: "hidden",
      }}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          tabCount={tabs.length}
          onSelect={onSelect}
          onClose={onClose}
          onRename={onRename}
        />
      ))}
      <div
        onClick={onAdd}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, cursor: "pointer", color: T.txt3,
          fontSize: 15, fontWeight: 300, transition: "color 0.12s",
        }}
      >
        +
      </div>
      <div style={{ flex: 1, background: "transparent" }} />
    </div>
  );
}

// ── SQL Editor (editable textarea with syntax highlight overlay) ─────────────
function SQLEditor({ sql, onChange, onRun }) {
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const lines = sql.split("\n");

  const handleInput = (e) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e) => {
    // Tab key inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = sql.substring(0, start) + "  " + sql.substring(end);
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    // Ctrl+Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun();
    }
  };

  const handleCursorChange = () => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const textBefore = sql.substring(0, pos);
    const lineNum = textBefore.split("\n").length;
    const lastNewline = textBefore.lastIndexOf("\n");
    const col = pos - lastNewline;
    setCursorPos({ line: lineNum, col });
  };

  const syncScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Cursor position indicator */}
      <div style={{
        display: "flex", justifyContent: "flex-end", padding: "2px 12px",
        background: T.bg1, borderBottom: `1px solid ${T.border}`,
        fontSize: 10, fontFamily: T.fontMono, color: T.txt3,
      }}>
        Ln {cursorPos.line}, Col {cursorPos.col}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Line number gutter */}
        <div
          style={{
            width: 36, minWidth: 36,
            background: T.bg1, borderRight: `1px solid ${T.border}`,
            fontFamily: T.fontMono, fontSize: 11, lineHeight: "20px",
            color: T.txt3, userSelect: "none",
            overflow: "hidden", padding: "8px 0",
          }}
        >
          {lines.map((_, idx) => (
            <div key={idx} style={{
              textAlign: "right", paddingRight: 8, minHeight: 20,
              color: idx + 1 === cursorPos.line ? T.txt2 : T.txt3,
            }}>
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Editor area (textarea + highlight overlay) */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Syntax highlight overlay */}
          <div
            ref={overlayRef}
            style={{
              position: "absolute", inset: 0,
              padding: "8px 12px",
              fontFamily: T.fontMono, fontSize: 11, lineHeight: "20px",
              pointerEvents: "none", overflow: "hidden",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}
          >
            {lines.map((line, i) => {
              const tokens = highlightSQL(line);
              return (
                <div key={i} style={{ minHeight: 20 }}>
                  {tokens.length === 0 ? "\u200B" : tokens.map((tok, j) => (
                    <span key={j} style={{ color: tok.color, fontWeight: tok.bold ? 700 : 400 }}>
                      {tok.text}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Actual editable textarea (transparent text) */}
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={handleCursorChange}
            onClick={handleCursorChange}
            onScroll={syncScroll}
            spellCheck={false}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              padding: "8px 12px",
              fontFamily: T.fontMono, fontSize: 11, lineHeight: "20px",
              background: "transparent", color: "transparent",
              caretColor: T.txt,
              border: "none", outline: "none", resize: "none",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              overflow: "auto",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Results Table ───────────────────────────────────────────────────────────
function ResultsTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: T.txt3, fontSize: 12, fontFamily: T.fontUI,
      }}>
        No results returned.
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontFamily: T.fontMono, fontSize: 11,
      }}>
        <thead>
          <tr>
            <th style={{
              position: "sticky", top: 0, textAlign: "right",
              padding: "5px 8px", color: T.txt3, fontSize: 9, fontWeight: 700,
              letterSpacing: 0.5, borderBottom: `1px solid ${T.border}`,
              borderRight: `1px solid ${T.border}`, background: T.bg2,
              fontFamily: T.fontUI, width: 36, minWidth: 36, zIndex: 2,
            }}>
              #
            </th>
            {columns.map((col) => (
              <th key={col} style={{
                position: "sticky", top: 0, textAlign: "left",
                padding: "5px 10px", color: T.txt2, fontSize: 10,
                fontWeight: 700, letterSpacing: 0.5,
                borderBottom: `1px solid ${T.border}`,
                borderRight: `1px solid ${T.border}`,
                background: T.bg2, fontFamily: T.fontUI,
                whiteSpace: "nowrap", zIndex: 2,
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? T.bg0 : `${T.bg1}60` }}>
              <td style={{
                textAlign: "right", padding: "4px 8px", color: T.txt3,
                fontSize: 10, borderRight: `1px solid ${T.border}`,
                fontFamily: T.fontMono, userSelect: "none",
              }}>
                {rowIdx + 1}
              </td>
              {columns.map((col) => {
                const val = row[col];
                const isNull = val === null || val === undefined;
                const isNumber = typeof val === "number" || /^\d+$/.test(String(val));
                return (
                  <td key={col} style={{
                    padding: "4px 10px",
                    color: isNull ? T.txt3 : T.txt,
                    fontStyle: isNull ? "italic" : "normal",
                    borderRight: `1px solid ${T.border}`,
                    whiteSpace: "nowrap",
                    textAlign: isNumber ? "right" : "left",
                  }}>
                    {isNull ? "NULL" : String(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Query status message ────────────────────────────────────────────────────
function QueryStatus({ result }) {
  if (!result) return null;
  if (result.error) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 8,
        color: T.red, fontFamily: T.fontUI,
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <circle cx={12} cy={12} r={10} stroke={T.red} strokeWidth={1.5} />
          <path d="M15 9l-6 6M9 9l6 6" stroke={T.red} strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Query Error</span>
        <span style={{ fontSize: 11, color: T.txt2, maxWidth: 500, textAlign: "center" }}>
          {result.error}
        </span>
      </div>
    );
  }
  if (result.message) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 8,
        color: T.green, fontFamily: T.fontUI,
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <circle cx={12} cy={12} r={10} stroke={T.green} strokeWidth={1.5} />
          <path d="M8 12l3 3 5-5" stroke={T.green} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{result.message}</span>
        {result.time && (
          <span style={{ fontSize: 10, color: T.txt3 }}>Completed in {result.time}</span>
        )}
      </div>
    );
  }
  return null;
}

// ── Main Screen ─────────────────────────────────────────────────────────────
function ScreenQuery() {
  const {
    activeConnection,
    sqlTabs,
    setSqlTabs,
    activeSqlTab,
    setActiveSqlTab,
    addSqlTab,
  } = useKawaii();

  // Per-tab SQL content & results stored here
  const [tabContents, setTabContents] = useState(() => {
    const map = {};
    sqlTabs.forEach((t) => { map[t.id] = t.content || ""; });
    return map;
  });
  const [tabResults, setTabResults] = useState({}); // tabId -> { data?, error?, message?, time? }

  // Sync when context tabs change (e.g. new tab added from elsewhere)
  useEffect(() => {
    setTabContents((prev) => {
      const next = { ...prev };
      sqlTabs.forEach((t) => {
        if (!(t.id in next)) next[t.id] = t.content || "";
      });
      return next;
    });
  }, [sqlTabs]);

  const currentSql = tabContents[activeSqlTab] || "";
  const currentResult = tabResults[activeSqlTab] || null;

  const handleSqlChange = useCallback((val) => {
    setTabContents((prev) => ({ ...prev, [activeSqlTab]: val }));
  }, [activeSqlTab]);

  const handleSelect = (id) => {
    setActiveSqlTab(id);
  };

  const handleAdd = () => {
    addSqlTab();
  };

  const handleClose = (id) => {
    if (sqlTabs.length <= 1) return;
    const filtered = sqlTabs.filter((t) => t.id !== id);
    setSqlTabs(filtered);
    // Clean up content/results
    setTabContents((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setTabResults((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (activeSqlTab === id) {
      setActiveSqlTab(filtered[0].id);
    }
  };

  const handleRename = (id, newName) => {
    setSqlTabs((prev) => prev.map((t) => t.id === id ? { ...t, name: newName } : t));
  };

  const handleRun = useCallback(async () => {
    const sql = (tabContents[activeSqlTab] || "").trim();
    if (!sql) {
      setTabResults((prev) => ({ ...prev, [activeSqlTab]: { error: "Empty query. Write some SQL and press Run." } }));
      return;
    }

    if (!activeConnection) {
      setTabResults((prev) => ({ ...prev, [activeSqlTab]: { error: "No active connection. Connect to a database first." } }));
      return;
    }

    // Show loading state
    setTabResults((prev) => ({ ...prev, [activeSqlTab]: { loading: true } }));

    try {
      const result = await window.akatsuki.kawaiidb.executeQuery({
        connectionId: activeConnection.id,
        sql,
      });

      if (result.error) {
        setTabResults((prev) => ({
          ...prev,
          [activeSqlTab]: { error: result.error, time: `${result.duration || 0}ms` },
        }));
      } else if (result.rows && result.rows.length > 0) {
        setTabResults((prev) => ({
          ...prev,
          [activeSqlTab]: {
            data: result.rows,
            message: null,
            time: `${result.duration || 0}ms`,
            rowCount: result.rowCount,
          },
        }));
      } else {
        setTabResults((prev) => ({
          ...prev,
          [activeSqlTab]: {
            message: result.message || `${result.rowCount || 0} rows affected`,
            time: `${result.duration || 0}ms`,
          },
        }));
      }
    } catch (e) {
      setTabResults((prev) => ({
        ...prev,
        [activeSqlTab]: { error: e.message || "Query execution failed" },
      }));
    }
  }, [activeSqlTab, tabContents, activeConnection]);

  const handleClear = () => {
    setTabContents((prev) => ({ ...prev, [activeSqlTab]: "" }));
    setTabResults((prev) => { const n = { ...prev }; delete n[activeSqlTab]; return n; });
  };

  const handleFormat = () => {
    // Basic SQL formatting: uppercase keywords, add newlines
    let sql = tabContents[activeSqlTab] || "";
    const keywords = ["SELECT", "FROM", "WHERE", "LEFT JOIN", "INNER JOIN", "RIGHT JOIN",
      "JOIN", "ON", "AND", "OR", "GROUP BY", "HAVING", "ORDER BY", "LIMIT",
      "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE",
      "DROP TABLE", "ALTER TABLE"];
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b${kw.replace(/ /g, "\\s+")}\\b`, "gi");
      sql = sql.replace(regex, `\n${kw}`);
    });
    sql = sql.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
    setTabContents((prev) => ({ ...prev, [activeSqlTab]: sql }));
  };

  // No connection state
  if (!activeConnection) {
    return (
      <div className="screen-enter" style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        background: T.bg0, color: T.txt3, fontFamily: T.fontUI,
      }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <span style={{ fontSize: 14, color: T.txt2 }}>No active connection</span>
        <span style={{ fontSize: 11 }}>Connect to a database from the Connections tab to run queries</span>
      </div>
    );
  }

  return (
    <div
      className="screen-enter"
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", background: T.bg0,
      }}
    >
      {/* Tab bar */}
      <TabBar
        tabs={sqlTabs}
        activeTabId={activeSqlTab}
        onSelect={handleSelect}
        onAdd={handleAdd}
        onClose={handleClose}
        onRename={handleRename}
      />

      {/* SQL Editor (top half) */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        borderBottom: `1px solid ${T.border}`, minHeight: 0,
      }}>
        <PanelHeader title="SQL Editor" accent={T.teal}>
          <Btn
            onClick={handleRun}
            style={{
              height: 24, fontSize: 10, padding: "0 12px",
              background: T.teal, color: T.bg0, border: "none",
              fontWeight: 700, borderRadius: 5,
            }}
          >
            {"\u25B6 Run"}
          </Btn>
          <Btn variant="ghost" onClick={handleFormat} style={{ height: 24, fontSize: 10, padding: "0 10px" }}>
            Format
          </Btn>
          <Btn variant="ghost" onClick={handleClear} style={{ height: 24, fontSize: 10, padding: "0 10px" }}>
            Clear
          </Btn>
          <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, marginLeft: "auto" }}>
            {activeConnection.name} / {activeConnection.database}
          </span>
        </PanelHeader>

        <SQLEditor sql={currentSql} onChange={handleSqlChange} onRun={handleRun} />
      </div>

      {/* Results (bottom half) */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        <PanelHeader
          title="Results"
          accent={T.green}
          count={currentResult?.data?.length ?? 0}
        >
          {currentResult?.time && (
            <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI }}>
              {currentResult.data ? `${currentResult.data.length} rows` : "OK"} in {currentResult.time}
            </span>
          )}
        </PanelHeader>

        {currentResult ? (
          currentResult.data ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {currentResult.info && (
                <div style={{
                  padding: "6px 12px", background: `${T.blue}08`,
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 10, color: T.blue, fontFamily: T.fontUI,
                }}>
                  {"\u2139"} {currentResult.info}
                </div>
              )}
              <ResultsTable data={currentResult.data} />
            </div>
          ) : currentResult.error ? (
            <QueryStatus result={currentResult} />
          ) : (
            <QueryStatus result={currentResult} />
          )
        ) : (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
            color: T.txt3, fontFamily: T.fontUI,
          }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                stroke={T.txt3} strokeWidth={1.5} strokeLinecap="round"
                strokeLinejoin="round" fill="none"
              />
            </svg>
            <span style={{ fontSize: 12 }}>Run a query to see results</span>
            <span style={{ fontSize: 10, color: T.txt3 }}>
              Press Run or Ctrl+Enter
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScreenQuery;

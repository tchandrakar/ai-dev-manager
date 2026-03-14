import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { T } from "../tokens";
import { PanelHeader } from "../components";
import { useKawaii } from "./KawaiiApp";
import { DB_TYPES } from "./mockData";
import { highlightSQL } from "./ScreenAIAnalyze";
import { buildSuggestions, useAutocomplete, SuggestionDropdownInline } from "./ScreenQuery";

// ── Status color helper ─────────────────────────────────────────────────────
function statusColor(status) {
  if (status === "active") return T.green;
  if (status === "pending") return T.amber;
  if (status === "inactive") return T.red;
  return T.txt3;
}

// ── Shared TreeRow component ────────────────────────────────────────────────
function TreeRow({ depth, children, onClick, style: rowStyle }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 8px",
        paddingLeft: 8 + depth * 14,
        cursor: onClick ? "pointer" : "default",
        fontSize: 11,
        fontFamily: T.fontUI,
        color: T.txt,
        userSelect: "none",
        minHeight: 26,
        ...rowStyle,
      }}
    >
      {children}
    </div>
  );
}

// ── Tree node item (extracted for hooks compliance) ─────────────────────────
function SchemaTableItem({ name, isActive, onSelect }) {
  return (
    <TreeRow
      depth={3}
      onClick={() => onSelect(name)}
      style={{
        background: isActive ? T.bg3 : "transparent",
        borderLeft: isActive ? `2px solid ${T.teal}` : "2px solid transparent",
      }}
    >
      <span style={{ color: T.txt3, marginRight: 6, fontSize: 10 }}>{"\u2261"}</span>
      <span
        style={{
          fontFamily: T.fontMono,
          fontSize: 11,
          color: isActive ? T.txt : T.txt2,
        }}
      >
        {name}
      </span>
    </TreeRow>
  );
}

function SchemaLeafItem({ name }) {
  return (
    <TreeRow depth={3}>
      <span style={{ color: T.txt3, marginRight: 6, fontSize: 10 }}>{"\u2261"}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.txt2 }}>{name}</span>
    </TreeRow>
  );
}

// ── Add Item Inline Input ───────────────────────────────────────────────────
function AddItemInput({ placeholder, onAdd, onCancel }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
    }
    onCancel();
  };

  return (
    <div style={{ padding: "2px 8px", paddingLeft: 8 + 3 * 14, display: "flex", gap: 4, alignItems: "center" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: T.bg3,
          border: `1px solid ${T.teal}`,
          borderRadius: 3,
          color: T.txt,
          fontSize: 11,
          fontFamily: T.fontMono,
          padding: "2px 6px",
          outline: "none",
        }}
      />
      <button
        onClick={handleSubmit}
        style={{
          background: T.teal,
          color: T.bg0,
          border: "none",
          borderRadius: 3,
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          cursor: "pointer",
        }}
      >
        Add
      </button>
    </div>
  );
}

// ── Schema Tree Sidebar ─────────────────────────────────────────────────────
function SchemaTreeSidebar({
  expandedNodes,
  toggleNode,
  activeTable,
  onSelectTable,
  schemaTables,
  schemaViews,
  schemaSPs,
  schemaFunctions,
  onAddTable,
  onAddView,
  onAddSP,
  onAddFunction,
}) {
  const { activeConnection } = useKawaii();
  const [addingTo, setAddingTo] = useState(null); // "tables" | "views" | "sp" | "fn" | null

  const isExpanded = (key) => expandedNodes.has(key);

  const connName = activeConnection ? activeConnection.name : null;
  const dbType = activeConnection
    ? (DB_TYPES[activeConnection.type]
        ? `${DB_TYPES[activeConnection.type].label} ${activeConnection.version || ""}`
        : activeConnection.type)
    : null;
  const dbName = activeConnection ? (activeConnection.database || "default") : null;

  if (!activeConnection) {
    return (
      <div
        style={{
          width: 260,
          minWidth: 260,
          background: T.bg2,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <PanelHeader title="DATABASE NAVIGATOR" accent={T.teal} />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>{"\u26C1"}</div>
            <div style={{ fontSize: 12, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600, marginBottom: 6 }}>
              No connection selected
            </div>
            <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI, lineHeight: 1.5 }}>
              Select a connection from the dropdown above to browse the schema.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        background: T.bg2,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <PanelHeader title="DATABASE NAVIGATOR" accent={T.teal} />
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {/* Connection node */}
        <TreeRow depth={0} onClick={() => toggleNode("connection")}>
          <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
            {isExpanded("connection") ? "\u25BE" : "\u25B8"}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: T.teal,
              flexShrink: 0,
              marginRight: 6,
            }}
          />
          <span style={{ fontWeight: 700, marginRight: 6, fontSize: 11 }}>
            {connName}
          </span>
          <span style={{ color: T.txt3, fontSize: 9 }}>{dbType}</span>
        </TreeRow>

        {isExpanded("connection") && (
          <>
            {/* Database node */}
            <TreeRow depth={1} onClick={() => toggleNode("db-main")}>
              <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
                {isExpanded("db-main") ? "\u25BE" : "\u25B8"}
              </span>
              <span style={{ marginRight: 6, fontSize: 12, color: T.amber }}>{"\u26C1"}</span>
              <span style={{ fontWeight: 700, fontSize: 11 }}>{dbName}</span>
            </TreeRow>

            {isExpanded("db-main") && (
              <>
                {/* Tables folder */}
                <TreeRow depth={2} onClick={() => toggleNode("folder-tables")}>
                  <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
                    {isExpanded("folder-tables") ? "\u25BE" : "\u25B8"}
                  </span>
                  <span style={{ color: T.txt2, marginRight: 6, fontSize: 11 }}>Tables</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: T.teal,
                      background: `${T.teal}18`,
                      padding: "1px 6px",
                      borderRadius: 9,
                      fontWeight: 600,
                    }}
                  >
                    {schemaTables.length}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingTo(addingTo === "tables" ? null : "tables");
                    }}
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: T.txt3,
                      cursor: "pointer",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </TreeRow>

                {isExpanded("folder-tables") && (
                  <>
                    {schemaTables.map((tbl) => (
                      <SchemaTableItem
                        key={tbl.name}
                        name={tbl.name}
                        isActive={activeTable === tbl.name}
                        onSelect={onSelectTable}
                      />
                    ))}
                    {schemaTables.length === 0 && (
                      <div style={{ padding: "6px 8px", paddingLeft: 8 + 3 * 14, fontSize: 10, color: T.txt3, fontStyle: "italic" }}>
                        No tables yet
                      </div>
                    )}
                  </>
                )}
                {addingTo === "tables" && (
                  <AddItemInput
                    placeholder="table_name"
                    onAdd={onAddTable}
                    onCancel={() => setAddingTo(null)}
                  />
                )}

                {/* Views folder */}
                <TreeRow depth={2} onClick={() => toggleNode("folder-views")}>
                  <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
                    {isExpanded("folder-views") ? "\u25BE" : "\u25B8"}
                  </span>
                  <span style={{ color: T.txt2, marginRight: 6, fontSize: 11 }}>Views</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: T.teal,
                      background: `${T.teal}18`,
                      padding: "1px 6px",
                      borderRadius: 9,
                      fontWeight: 600,
                    }}
                  >
                    {schemaViews.length}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingTo(addingTo === "views" ? null : "views");
                    }}
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: T.txt3,
                      cursor: "pointer",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </TreeRow>

                {isExpanded("folder-views") && (
                  <>
                    {schemaViews.map((v) => (
                      <SchemaLeafItem key={v} name={v} />
                    ))}
                    {schemaViews.length === 0 && (
                      <div style={{ padding: "6px 8px", paddingLeft: 8 + 3 * 14, fontSize: 10, color: T.txt3, fontStyle: "italic" }}>
                        No views yet
                      </div>
                    )}
                  </>
                )}
                {addingTo === "views" && (
                  <AddItemInput
                    placeholder="view_name"
                    onAdd={onAddView}
                    onCancel={() => setAddingTo(null)}
                  />
                )}

                {/* Stored Procedures folder */}
                <TreeRow depth={2} onClick={() => toggleNode("folder-sp")}>
                  <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
                    {isExpanded("folder-sp") ? "\u25BE" : "\u25B8"}
                  </span>
                  <span style={{ color: T.txt2, marginRight: 6, fontSize: 11 }}>Stored Procedures</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: T.teal,
                      background: `${T.teal}18`,
                      padding: "1px 6px",
                      borderRadius: 9,
                      fontWeight: 600,
                    }}
                  >
                    {schemaSPs.length}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingTo(addingTo === "sp" ? null : "sp");
                    }}
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: T.txt3,
                      cursor: "pointer",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </TreeRow>

                {isExpanded("folder-sp") && (
                  <>
                    {schemaSPs.map((sp) => (
                      <SchemaLeafItem key={sp} name={sp} />
                    ))}
                    {schemaSPs.length === 0 && (
                      <div style={{ padding: "6px 8px", paddingLeft: 8 + 3 * 14, fontSize: 10, color: T.txt3, fontStyle: "italic" }}>
                        No stored procedures yet
                      </div>
                    )}
                  </>
                )}
                {addingTo === "sp" && (
                  <AddItemInput
                    placeholder="sp_name"
                    onAdd={onAddSP}
                    onCancel={() => setAddingTo(null)}
                  />
                )}

                {/* Functions folder */}
                <TreeRow depth={2} onClick={() => toggleNode("folder-fn")}>
                  <span style={{ color: T.txt3, fontSize: 9, width: 12, textAlign: "center", marginRight: 4, flexShrink: 0 }}>
                    {isExpanded("folder-fn") ? "\u25BE" : "\u25B8"}
                  </span>
                  <span style={{ color: T.txt2, marginRight: 6, fontSize: 11 }}>Functions</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: T.teal,
                      background: `${T.teal}18`,
                      padding: "1px 6px",
                      borderRadius: 9,
                      fontWeight: 600,
                    }}
                  >
                    {schemaFunctions.length}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingTo(addingTo === "fn" ? null : "fn");
                    }}
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: T.txt3,
                      cursor: "pointer",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </TreeRow>

                {isExpanded("folder-fn") && (
                  <>
                    {schemaFunctions.map((fn) => (
                      <SchemaLeafItem key={fn} name={fn} />
                    ))}
                    {schemaFunctions.length === 0 && (
                      <div style={{ padding: "6px 8px", paddingLeft: 8 + 3 * 14, fontSize: 10, color: T.txt3, fontStyle: "italic" }}>
                        No functions yet
                      </div>
                    )}
                  </>
                )}
                {addingTo === "fn" && (
                  <AddItemInput
                    placeholder="fn_name"
                    onAdd={onAddFunction}
                    onCancel={() => setAddingTo(null)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── SQL Editor Tab Button ───────────────────────────────────────────────────
function EditorTabButton({ tab, isActive, onSelect, onClose, onDoubleClick }) {
  return (
    <div
      onClick={() => onSelect(tab.id)}
      onDoubleClick={() => onDoubleClick(tab.id)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px",
        height: "100%",
        cursor: "pointer",
        background: isActive ? T.bg3 : "transparent",
        borderRight: `1px solid ${T.border}`,
        fontSize: 11,
        fontFamily: T.fontMono,
        color: isActive ? T.txt : T.txt2,
      }}
    >
      <span>{tab.name}</span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        style={{
          fontSize: 9,
          color: T.txt3,
          marginLeft: 2,
          lineHeight: 1,
        }}
      >
        {"\u2715"}
      </span>
      {isActive && (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: T.teal,
          }}
        />
      )}
    </div>
  );
}

// ── SQL Query Result Row ────────────────────────────────────────────────────
function QueryResultRow({ row, columns, rowIndex }) {
  return (
    <tr style={{ background: rowIndex % 2 === 0 ? T.bg0 : T.bg1 }}>
      {columns.map((col) => (
        <td
          key={col}
          style={{
            padding: "5px 10px",
            color: T.txt,
            fontFamily: T.fontMono,
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          {row[col] === null || row[col] === undefined ? (
            <span style={{ color: T.txt3, fontStyle: "italic" }}>NULL</span>
          ) : (
            String(row[col])
          )}
        </td>
      ))}
    </tr>
  );
}

// ── SQL Editor Sub-View ─────────────────────────────────────────────────────
function SQLEditorView() {
  const { sqlTabs, activeSqlTab, setActiveSqlTab, addSqlTab, activeConnection, schema, setActiveTab, setAiAnalyzeInitialSQL } = useKawaii();
  const suggestions = useMemo(() => buildSuggestions(schema), [schema]);

  // Per-tab SQL content storage
  const [tabContents, setTabContents] = useState(() => {
    const initial = {};
    sqlTabs.forEach((t) => {
      initial[t.id] = t.content || "";
    });
    return initial;
  });

  // Rename state
  const [renamingTab, setRenamingTab] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef(null);

  // Query results per tab
  const [tabResults, setTabResults] = useState({});

  // Textarea ref for editor
  const textareaRef = useRef(null);

  // Cursor position
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Autocomplete
  const handleSqlChangeForAC = useCallback((val) => {
    setTabContents((prev) => ({ ...prev, [activeSqlTab]: val }));
  }, [activeSqlTab]);
  const ac = useAutocomplete(textareaRef, tabContents[activeSqlTab] || "", handleSqlChangeForAC, suggestions);

  // Sync new tabs into tabContents
  useEffect(() => {
    setTabContents((prev) => {
      const next = { ...prev };
      sqlTabs.forEach((t) => {
        if (!(t.id in next)) {
          next[t.id] = t.content || "";
        }
      });
      return next;
    });
  }, [sqlTabs]);

  const currentContent = tabContents[activeSqlTab] || "";
  const sqlLines = useMemo(() => currentContent.split("\n"), [currentContent]);

  const handleContentChange = useCallback(
    (e) => {
      const val = e.target.value;
      setTabContents((prev) => ({ ...prev, [activeSqlTab]: val }));
      requestAnimationFrame(() => ac.handleInputForSuggestions());
    },
    [activeSqlTab, ac.handleInputForSuggestions]
  );

  const handleCursorChange = useCallback((e) => {
    const ta = e.target;
    const text = ta.value.substring(0, ta.selectionStart);
    const lines = text.split("\n");
    setCursorLine(lines.length);
    setCursorCol(lines[lines.length - 1].length + 1);
  }, []);

  const handleCloseTab = useCallback(
    (tabId) => {
      // Don't close if it's the last tab
      if (sqlTabs.length <= 1) return;
      // Remove content for this tab
      setTabContents((prev) => {
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
      // Switch to adjacent tab if closing the active one
      if (activeSqlTab === tabId) {
        const idx = sqlTabs.findIndex((t) => t.id === tabId);
        const newActive = sqlTabs[idx > 0 ? idx - 1 : idx + 1];
        if (newActive) setActiveSqlTab(newActive.id);
      }
    },
    [sqlTabs, activeSqlTab, setActiveSqlTab]
  );

  const handleDoubleClickTab = useCallback(
    (tabId) => {
      const tab = sqlTabs.find((t) => t.id === tabId);
      if (tab) {
        setRenamingTab(tabId);
        setRenameValue(tab.name);
        setTimeout(() => {
          if (renameRef.current) renameRef.current.focus();
        }, 50);
      }
    },
    [sqlTabs]
  );

  const handleRenameSubmit = useCallback(() => {
    // The context doesn't expose setSqlTabs directly, so we store rename in local state
    // This is a UI-only feature for now
    setRenamingTab(null);
  }, []);

  // Execute SQL via real IPC
  const handleRunQuery = useCallback(async () => {
    const sql = (tabContents[activeSqlTab] || "").trim();
    if (!sql) {
      setTabResults((prev) => ({
        ...prev,
        [activeSqlTab]: { status: "error", message: "No SQL to execute", columns: [], rows: [], time: 0 },
      }));
      return;
    }

    if (!activeConnection) {
      setTabResults((prev) => ({
        ...prev,
        [activeSqlTab]: { status: "error", message: "No active connection. Select a connection first.", columns: [], rows: [], time: 0 },
      }));
      return;
    }

    // Show loading
    setTabResults((prev) => ({
      ...prev,
      [activeSqlTab]: { status: "loading", message: "Executing...", columns: [], rows: [], time: 0 },
    }));

    try {
      const result = await window.akatsuki.kawaiidb.executeQuery({
        connectionId: activeConnection.id,
        sql,
      });

      if (result.error) {
        setTabResults((prev) => ({
          ...prev,
          [activeSqlTab]: {
            status: "error",
            message: result.error,
            columns: [],
            rows: [],
            time: result.duration || 0,
          },
        }));
      } else {
        const columns = result.columns || (result.rows?.length > 0 ? Object.keys(result.rows[0]) : []);
        setTabResults((prev) => ({
          ...prev,
          [activeSqlTab]: {
            status: "success",
            message: result.message || `${result.rowCount ?? result.rows?.length ?? 0} rows returned in ${result.duration}ms`,
            columns,
            rows: result.rows || [],
            time: (result.duration || 0) / 1000,
          },
        }));
      }
    } catch (e) {
      setTabResults((prev) => ({
        ...prev,
        [activeSqlTab]: { status: "error", message: e.message || "Query execution failed", columns: [], rows: [], time: 0 },
      }));
    }
  }, [activeSqlTab, tabContents, activeConnection]);

  // Keyboard shortcut
  const handleKeyDown = useCallback(
    (e) => {
      // Let autocomplete handle first
      if (ac.handleKeyDownForSuggestions(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunQuery();
      }
    },
    [handleRunQuery, ac.handleKeyDownForSuggestions]
  );

  const result = tabResults[activeSqlTab];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tab bar */}
      <div
        style={{
          height: 30,
          minHeight: 30,
          display: "flex",
          alignItems: "center",
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
          gap: 0,
          paddingLeft: 0,
        }}
      >
        {sqlTabs.map((tab) => {
          const isActive = tab.id === activeSqlTab;
          if (renamingTab === tab.id) {
            return (
              <div
                key={tab.id}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 8px",
                  height: "100%",
                  background: T.bg3,
                  borderRight: `1px solid ${T.border}`,
                }}
              >
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                    if (e.key === "Escape") setRenamingTab(null);
                  }}
                  style={{
                    background: T.bg4,
                    border: `1px solid ${T.teal}`,
                    borderRadius: 2,
                    color: T.txt,
                    fontSize: 11,
                    fontFamily: T.fontMono,
                    padding: "0 4px",
                    width: 100,
                    outline: "none",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: T.teal,
                  }}
                />
              </div>
            );
          }
          return (
            <EditorTabButton
              key={tab.id}
              tab={tab}
              isActive={isActive}
              onSelect={setActiveSqlTab}
              onClose={handleCloseTab}
              onDoubleClick={handleDoubleClickTab}
            />
          );
        })}
        <div
          onClick={addSqlTab}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: "100%",
            cursor: "pointer",
            color: T.txt3,
            fontSize: 14,
          }}
        >
          +
        </div>
      </div>

      {/* Editor + Results split */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Editor area (top half) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <PanelHeader title="SQL EDITOR" accent={T.teal}>
            <span
              style={{
                fontSize: 10,
                fontFamily: T.fontMono,
                color: T.txt3,
                marginRight: 8,
              }}
            >
              Ln {cursorLine}, Col {cursorCol}
            </span>
            <button
              onClick={handleRunQuery}
              style={{
                padding: "3px 12px",
                borderRadius: 4,
                border: "none",
                background: T.teal,
                color: T.bg0,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Run
            </button>
            <button
              onClick={() => {
                const raw = tabContents[activeSqlTab] || "";
                if (!raw.trim()) return;
                // Simple SQL formatter: uppercase keywords, newlines before major clauses
                const kws = /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|FULL JOIN|CROSS JOIN|ON|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|UNION|UNION ALL|CASE|WHEN|THEN|ELSE|END)\b/gi;
                let formatted = raw.replace(kws, (m) => m.toUpperCase());
                // Add newlines before major clauses
                formatted = formatted.replace(/\s+(FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|SET|VALUES|UNION|ON)\b/gi,
                  (m, kw) => "\n" + kw.toUpperCase());
                // Indent continuation lines
                formatted = formatted.replace(/\n(AND|OR)\b/gi, (m, kw) => "\n  " + kw.toUpperCase());
                setTabContents((prev) => ({ ...prev, [activeSqlTab]: formatted.trim() }));
              }}
              style={{
                padding: "3px 12px",
                borderRadius: 4,
                border: `1px solid ${T.txt3}40`,
                background: `${T.txt3}14`,
                color: T.txt2,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Format
            </button>
            <button
              onClick={() => {
                const sql = (tabContents[activeSqlTab] || "").trim();
                if (sql) {
                  setAiAnalyzeInitialSQL(sql);
                  setActiveTab("ai-analyze");
                }
              }}
              style={{
                padding: "3px 12px",
                borderRadius: 4,
                border: `1px solid ${T.purple}50`,
                background: `${T.purple}18`,
                color: T.purple,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              AI Analyze
            </button>
          </PanelHeader>

          <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
            {/* Line number gutter */}
            <div
              style={{
                width: 40,
                minWidth: 40,
                background: T.bg1,
                borderRight: `1px solid ${T.border}`,
                padding: "8px 0",
                textAlign: "right",
                fontFamily: T.fontMono,
                fontSize: 11,
                color: T.txt3,
                lineHeight: "20px",
                userSelect: "none",
                overflowY: "hidden",
              }}
            >
              {sqlLines.map((_, i) => (
                <div key={i} style={{ paddingRight: 8, color: i + 1 === cursorLine ? T.txt2 : T.txt3 }}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code area with overlay */}
            <div style={{ flex: 1, position: "relative", overflow: "auto" }}>
              {/* Syntax highlighting layer */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: "8px 12px",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  lineHeight: "20px",
                  pointerEvents: "none",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {sqlLines.map((line, i) => {
                  const tokens = highlightSQL(line);
                  const isCurrentLine = i + 1 === cursorLine;
                  return (
                    <div
                      key={i}
                      style={{
                        background: isCurrentLine ? `${T.bg3}40` : "transparent",
                        minHeight: 20,
                      }}
                    >
                      {tokens.map((tok, j) => (
                        <span
                          key={j}
                          style={{
                            color: tok.color,
                            fontWeight: tok.bold ? 700 : 400,
                          }}
                        >
                          {tok.text}
                        </span>
                      ))}
                      {line === "" && "\u00A0"}
                    </div>
                  );
                })}
              </div>

              {/* Editable textarea layer */}
              <textarea
                ref={textareaRef}
                value={currentContent}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                onKeyUp={handleCursorChange}
                onClick={handleCursorChange}
                spellCheck={false}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  padding: "8px 12px",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  lineHeight: "20px",
                  background: "transparent",
                  color: "transparent",
                  caretColor: T.txt,
                  border: "none",
                  outline: "none",
                  resize: "none",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  overflow: "hidden",
                }}
              />

              {/* Autocomplete dropdown */}
              <SuggestionDropdownInline
                textareaRef={textareaRef}
                sql={currentContent}
                cursorTrigger={ac.cursorTrigger}
                suggestions={suggestions}
                visible={ac.showSuggestions}
                onSelect={ac.acceptSuggestion}
                selectedIdxRef={ac.selectedIdxRef}
                filteredRef={ac.filteredRef}
              />
            </div>
          </div>
        </div>

        {/* Results panel (bottom half) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            borderTop: `1px solid ${T.border}`,
            overflow: "hidden",
          }}
        >
          <PanelHeader
            title="RESULTS"
            accent={result && result.status === "success" ? T.green : result && result.status === "error" ? T.red : T.txt3}
          >
            {result && (
              <span
                style={{
                  fontSize: 10,
                  color: result.status === "success" ? T.green : T.red,
                  fontFamily: T.fontMono,
                  marginRight: 8,
                }}
              >
                {result.rows.length > 0
                  ? `${result.rows.length} rows in ${result.time}s`
                  : result.status === "success"
                  ? "OK"
                  : "Error"}
              </span>
            )}
            <button
              style={{
                background: T.bg3,
                border: `1px solid ${T.border}`,
                borderRadius: 4,
                color: T.txt2,
                fontSize: 10,
                padding: "2px 8px",
                cursor: "pointer",
                fontFamily: T.fontUI,
                marginRight: 4,
              }}
            >
              Export
            </button>
            <button
              style={{
                background: T.bg3,
                border: `1px solid ${T.border}`,
                borderRadius: 4,
                color: T.txt2,
                fontSize: 10,
                padding: "2px 8px",
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Copy
            </button>
          </PanelHeader>

          <div style={{ flex: 1, overflow: "auto" }}>
            {!result && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 24, opacity: 0.2 }}>{"\u25B6"}</div>
                <div style={{ fontSize: 12, color: T.txt3, fontFamily: T.fontUI }}>
                  Run a query to see results
                </div>
                <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
                  Ctrl+Enter to execute
                </div>
              </div>
            )}

            {result && result.status === "error" && (
              <div
                style={{
                  padding: 16,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14, color: T.red }}>{"\u2716"}</span>
                <div>
                  <div style={{ fontSize: 12, color: T.red, fontWeight: 600, fontFamily: T.fontUI, marginBottom: 4 }}>
                    Error
                  </div>
                  <div style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontMono }}>
                    {result.message}
                  </div>
                </div>
              </div>
            )}

            {result && result.status === "success" && result.columns.length === 0 && (
              <div
                style={{
                  padding: 16,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14, color: T.green }}>{"\u2714"}</span>
                <div>
                  <div style={{ fontSize: 12, color: T.green, fontWeight: 600, fontFamily: T.fontUI, marginBottom: 4 }}>
                    Success
                  </div>
                  <div style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI }}>
                    {result.message}
                  </div>
                </div>
              </div>
            )}

            {result && result.status === "success" && result.columns.length > 0 && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                }}
              >
                <thead>
                  <tr style={{ background: T.bg2 }}>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "6px 10px",
                          textAlign: "left",
                          fontSize: 9,
                          fontWeight: 700,
                          color: T.txt2,
                          letterSpacing: 0.5,
                          borderBottom: `1px solid ${T.border}`,
                          whiteSpace: "nowrap",
                          position: "sticky",
                          top: 0,
                          background: T.bg2,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <QueryResultRow key={i} row={row} columns={result.columns} rowIndex={i} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Status bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 12px",
              borderTop: `1px solid ${T.border}`,
              background: T.bg1,
              minHeight: 30,
            }}
          >
            <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>
              {result
                ? result.rows.length > 0
                  ? `Showing ${result.rows.length} rows`
                  : result.status === "success"
                  ? "Query completed"
                  : "Query failed"
                : "Ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Table Data Column Header ────────────────────────────────────────────────
function TableColumnHeader({ col, sortColumn, sortDir, onSort, onRemove }) {
  return (
    <th
      onClick={() => onSort(col.name)}
      style={{
        padding: "4px 10px",
        textAlign: "left",
        borderBottom: `1px solid ${T.border}`,
        position: "sticky",
        top: 0,
        background: T.bg2,
        cursor: "pointer",
        userSelect: "none",
        height: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {col.pk && <span style={{ fontSize: 8, color: T.amber }}>PK</span>}
        {col.fk && <span style={{ fontSize: 8, color: T.blue }}>FK</span>}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.txt2,
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          {col.name}
        </span>
        {sortColumn === col.name && (
          <span style={{ color: T.teal, fontSize: 8 }}>
            {sortDir === "asc" ? "\u25B4" : "\u25BE"}
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove(col.name);
          }}
          style={{
            marginLeft: "auto",
            fontSize: 9,
            color: T.txt3,
            cursor: "pointer",
            opacity: 0.5,
            padding: "0 2px",
          }}
        >
          {"\u2715"}
        </span>
      </div>
      <div
        style={{
          fontSize: 8,
          color: T.txt3,
          fontWeight: 400,
          marginTop: 1,
          fontFamily: T.fontMono,
        }}
      >
        {col.type}
      </div>
    </th>
  );
}

// ── Table Data Cell ─────────────────────────────────────────────────────────
function TableDataCell({ value, isEditing, onStartEdit, onSave }) {
  const [editValue, setEditValue] = useState(value === null ? "" : String(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value === null ? "" : String(value));
  }, [value]);

  const isNull = value === null || value === undefined;

  if (isEditing) {
    return (
      <td style={{ padding: "2px 4px" }}>
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => onSave(editValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(editValue);
            if (e.key === "Escape") onSave(value);
          }}
          style={{
            width: "100%",
            background: T.bg3,
            border: `1px solid ${T.blue}`,
            borderRadius: 2,
            color: T.txt,
            fontSize: 11,
            fontFamily: T.fontMono,
            padding: "2px 6px",
            outline: "none",
          }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={onStartEdit}
      style={{
        padding: "4px 10px",
        fontFamily: T.fontMono,
        fontSize: 11,
        color: isNull ? T.txt3 : T.txt,
        fontStyle: isNull ? "italic" : "normal",
        cursor: "text",
        border: "1px solid transparent",
        whiteSpace: "nowrap",
      }}
    >
      {isNull ? "NULL" : String(value)}
    </td>
  );
}

// ── Table Data Row ──────────────────────────────────────────────────────────
function TableDataRow({ row, rowIndex, columns, isSelected, editingCell, onToggleSelect, onStartEdit, onSaveCell }) {
  return (
    <tr
      style={{
        background: isSelected
          ? `${T.teal}10`
          : rowIndex % 2 === 0
          ? T.bg0
          : T.bg1,
        borderLeft: isSelected ? `2px solid ${T.teal}` : "2px solid transparent",
        height: 30,
      }}
    >
      {/* Checkbox */}
      <td style={{ padding: "4px 8px" }}>
        <div
          onClick={() => onToggleSelect(rowIndex)}
          style={{
            width: 12,
            height: 12,
            border: isSelected ? "none" : `1px solid ${T.border2}`,
            borderRadius: 2,
            background: isSelected ? T.teal : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            color: T.bg0,
            fontWeight: 700,
          }}
        >
          {isSelected && "\u2713"}
        </div>
      </td>
      {columns.map((col) => {
        const value = row[col.name];
        const isEditing =
          editingCell &&
          editingCell.row === rowIndex &&
          editingCell.col === col.name;

        // Status column special rendering
        if (col.name === "status" && !isEditing) {
          const sColor = statusColor(value);
          return (
            <td
              key={col.name}
              onClick={() => onStartEdit(rowIndex, col.name)}
              style={{
                padding: "4px 10px",
                fontFamily: T.fontMono,
                fontSize: 11,
                cursor: "text",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: sColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: sColor }}>{value}</span>
              </div>
            </td>
          );
        }

        return (
          <TableDataCell
            key={col.name}
            value={value}
            isEditing={isEditing}
            onStartEdit={() => onStartEdit(rowIndex, col.name)}
            onSave={(newVal) => onSaveCell(rowIndex, col.name, newVal)}
          />
        );
      })}
    </tr>
  );
}

// ── Table Data Viewer Sub-View ──────────────────────────────────────────────
function TableDataView({ activeTable, schemaTables }) {
  const { activeConnection } = useKawaii();

  // Column definitions state
  const [columns, setColumns] = useState([]);
  // Row data state
  const [rows, setRows] = useState([]);

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filterText, setFilterText] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("VARCHAR(255)");
  const newColRef = useRef(null);

  const [totalRowCount, setTotalRowCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);

  // Fetch real table data when table changes or pagination changes
  useEffect(() => {
    setColumns([]);
    setRows([]);
    setSelectedRows(new Set());
    setEditingCell(null);
    setSortColumn(null);
    setFilterText("");
    setTotalRowCount(0);

    if (!activeTable || !activeConnection) return;

    let cancelled = false;
    (async () => {
      setTableLoading(true);
      try {
        const result = await window.akatsuki.kawaiidb.fetchTableData({
          connectionId: activeConnection.id,
          tableName: activeTable,
          page: 1,
          pageSize: rowsPerPage,
        });
        if (cancelled) return;
        if (result && !result.error) {
          if (result.columns) {
            // Convert column names to objects if they're strings
            const cols = Array.isArray(result.columns)
              ? result.columns.map((c) => typeof c === "string" ? { name: c, type: "TEXT" } : c)
              : [];
            setColumns(cols);
          }
          if (result.rows) setRows(result.rows);
          if (result.totalRows != null) setTotalRowCount(result.totalRows);
        }
      } catch {}
      if (!cancelled) setTableLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeTable, activeConnection?.id]);

  const toggleRow = useCallback((rowIdx) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  }, []);

  const handleSort = useCallback(
    (colName) => {
      if (sortColumn === colName) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colName);
        setSortDir("asc");
      }
    },
    [sortColumn]
  );

  const handleAddColumn = useCallback(() => {
    const trimmed = newColName.trim();
    if (!trimmed) return;
    if (columns.find((c) => c.name === trimmed)) return;
    setColumns((prev) => [...prev, { name: trimmed, type: newColType }]);
    // Add the column to existing rows
    setRows((prev) => prev.map((row) => ({ ...row, [trimmed]: null })));
    setNewColName("");
    setNewColType("VARCHAR(255)");
    setShowAddColumn(false);
  }, [newColName, newColType, columns]);

  const handleRemoveColumn = useCallback(
    (colName) => {
      setColumns((prev) => prev.filter((c) => c.name !== colName));
      setRows((prev) =>
        prev.map((row) => {
          const next = { ...row };
          delete next[colName];
          return next;
        })
      );
    },
    []
  );

  const handleAddRow = useCallback(() => {
    const newRow = {};
    columns.forEach((col) => {
      newRow[col.name] = null;
    });
    setRows((prev) => [...prev, newRow]);
  }, [columns]);

  const handleDeleteRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    setRows((prev) => prev.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
  }, [selectedRows]);

  const handleStartEdit = useCallback((rowIdx, colName) => {
    setEditingCell({ row: rowIdx, col: colName });
  }, []);

  const handleSaveCell = useCallback((rowIdx, colName, newValue) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colName]: newValue === "" ? null : newValue };
      return next;
    });
    setEditingCell(null);
  }, []);

  // Sort and filter rows
  const processedRows = useMemo(() => {
    let result = [...rows];

    // Filter
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = row[col.name];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(lower);
        })
      );
    }

    // Sort
    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [rows, columns, filterText, sortColumn, sortDir]);

  // Pagination
  const totalRows = processedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedRows = processedRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const dbName = activeConnection ? (activeConnection.database || "default") : "";

  if (!activeTable) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.2 }}>{"\u2261"}</div>
        <div style={{ fontSize: 13, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600 }}>
          No table selected
        </div>
        <div style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
          Select a table from the schema tree to view its data.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Table header bar */}
      <div
        style={{
          height: 52,
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
          gap: 12,
        }}
      >
        <span style={{ color: T.txt3, fontSize: 14, marginRight: 2 }}>{"\u2261"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.txt, fontFamily: T.fontUI }}>
            {activeTable}
          </div>
          <div style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI }}>
            {dbName} &rsaquo; Tables &rsaquo; {activeTable}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            color: T.teal,
            background: `${T.teal}18`,
            padding: "2px 8px",
            borderRadius: 9,
            fontWeight: 600,
            fontFamily: T.fontMono,
            marginLeft: 4,
          }}
        >
          {rows.length} rows
        </span>
        <span
          style={{
            fontSize: 10,
            color: T.blue,
            background: `${T.blue}18`,
            padding: "2px 8px",
            borderRadius: 9,
            fontWeight: 600,
            fontFamily: T.fontMono,
          }}
        >
          {columns.length} cols
        </span>
        <div style={{ flex: 1 }} />
        {/* Action buttons */}
        <button
          onClick={() => {
            setShowAddColumn(true);
            setTimeout(() => { if (newColRef.current) newColRef.current.focus(); }, 50);
          }}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            border: `1px solid ${T.blue}`,
            background: "transparent",
            color: T.blue,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.fontUI,
          }}
        >
          + Add Column
        </button>
        <button
          onClick={handleAddRow}
          disabled={columns.length === 0}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            border: `1px solid ${T.teal}`,
            background: "transparent",
            color: columns.length === 0 ? T.txt3 : T.teal,
            fontSize: 10,
            fontWeight: 600,
            cursor: columns.length === 0 ? "not-allowed" : "pointer",
            fontFamily: T.fontUI,
          }}
        >
          + Add Row
        </button>
        <button
          onClick={handleDeleteRows}
          disabled={selectedRows.size === 0}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            border: `1px solid ${selectedRows.size > 0 ? T.red : T.border}`,
            background: "transparent",
            color: selectedRows.size > 0 ? T.red : T.txt3,
            fontSize: 10,
            fontWeight: 600,
            cursor: selectedRows.size > 0 ? "pointer" : "not-allowed",
            fontFamily: T.fontUI,
          }}
        >
          Delete Row{selectedRows.size > 1 ? "s" : ""}
        </button>
      </div>

      {/* Add column form */}
      {showAddColumn && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 16px",
            background: T.bg2,
            borderBottom: `1px solid ${T.border}`,
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600 }}>
            New column:
          </span>
          <input
            ref={newColRef}
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddColumn();
              if (e.key === "Escape") setShowAddColumn(false);
            }}
            placeholder="column_name"
            style={{
              width: 160,
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              borderRadius: 4,
              color: T.txt,
              fontSize: 11,
              fontFamily: T.fontMono,
              padding: "4px 8px",
              outline: "none",
            }}
          />
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value)}
            style={{
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              borderRadius: 4,
              color: T.txt,
              fontSize: 11,
              fontFamily: T.fontMono,
              padding: "4px 8px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {[
              "INT",
              "BIGINT",
              "VARCHAR(50)",
              "VARCHAR(100)",
              "VARCHAR(255)",
              "TEXT",
              "DECIMAL",
              "FLOAT",
              "BOOLEAN",
              "DATE",
              "DATETIME",
              "TIMESTAMP",
              "ENUM",
              "JSON",
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={handleAddColumn}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: T.teal,
                color: T.bg0,
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Add
            </button>
            <button
              onClick={() => setShowAddColumn(false)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.txt2,
                fontSize: 10,
                cursor: "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          height: 36,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          background: T.bg2,
          borderBottom: `1px solid ${T.border}`,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600 }}>
          Filter:
        </span>
        <input
          value={filterText}
          onChange={(e) => {
            setFilterText(e.target.value);
            setPage(1);
          }}
          placeholder="Search across all columns..."
          style={{
            width: 400,
            background: T.bg3,
            border: `1px solid ${T.border2}`,
            borderRadius: 4,
            color: T.txt,
            fontSize: 11,
            fontFamily: T.fontMono,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            setFilterText("");
            setPage(1);
          }}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.txt2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: T.fontUI,
          }}
        >
          Clear
        </button>
        {filterText && (
          <span
            style={{
              fontSize: 9,
              color: T.amber,
              background: `${T.amber}18`,
              padding: "2px 8px",
              borderRadius: 9,
              fontWeight: 600,
              fontFamily: T.fontUI,
              marginLeft: 4,
            }}
          >
            filter active
          </span>
        )}
      </div>

      {/* Data grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {columns.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 28, opacity: 0.2 }}>{"\u2261"}</div>
            <div style={{ fontSize: 13, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600 }}>
              No columns defined
            </div>
            <div style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
              Click "+ Add Column" to define the table structure.
            </div>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 11,
            }}
          >
            <thead>
              <tr style={{ background: T.bg2 }}>
                {/* Checkbox column header */}
                <th
                  style={{
                    width: 32,
                    padding: "4px 8px",
                    borderBottom: `1px solid ${T.border}`,
                    position: "sticky",
                    top: 0,
                    background: T.bg2,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      border: `1px solid ${T.border2}`,
                      borderRadius: 2,
                    }}
                  />
                </th>
                {columns.map((col) => (
                  <TableColumnHeader
                    key={col.name}
                    col={col}
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={handleSort}
                    onRemove={handleRemoveColumn}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: T.txt3,
                      fontFamily: T.fontUI,
                      fontSize: 12,
                    }}
                  >
                    {rows.length === 0
                      ? 'No rows yet. Click "+ Add Row" to add data.'
                      : "No rows match the filter."}
                  </td>
                </tr>
              )}
              {pagedRows.map((row, ri) => {
                // Calculate actual row index for selection
                const actualIdx = (safePage - 1) * rowsPerPage + ri;
                return (
                  <TableDataRow
                    key={actualIdx}
                    row={row}
                    rowIndex={actualIdx}
                    columns={columns}
                    isSelected={selectedRows.has(actualIdx)}
                    editingCell={editingCell}
                    onToggleSelect={toggleRow}
                    onStartEdit={handleStartEdit}
                    onSaveCell={handleSaveCell}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 16px",
          borderTop: `1px solid ${T.border}`,
          background: T.bg1,
          minHeight: 32,
        }}
      >
        <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>
          {totalRows > 0
            ? `Showing ${(safePage - 1) * rowsPerPage + 1}-${Math.min(safePage * rowsPerPage, totalRows)} of ${totalRows} rows`
            : `${rows.length} rows total`}
        </span>
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: safePage === 1 ? T.txt3 : T.txt2,
                fontSize: 9,
                cursor: safePage === 1 ? "default" : "pointer",
                fontFamily: T.fontUI,
              }}
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: safePage === 1 ? T.txt3 : T.txt2,
                fontSize: 9,
                cursor: safePage === 1 ? "default" : "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (safePage <= 3) {
                pageNum = i + 1;
              } else if (safePage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = safePage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  style={{
                    width: 24,
                    height: 20,
                    borderRadius: 4,
                    border: "none",
                    background: pageNum === safePage ? T.teal : T.bg3,
                    color: pageNum === safePage ? T.bg0 : T.txt2,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: T.fontUI,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: safePage === totalPages ? T.txt3 : T.txt2,
                fontSize: 9,
                cursor: safePage === totalPages ? "default" : "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: safePage === totalPages ? T.txt3 : T.txt2,
                fontSize: 9,
                cursor: safePage === totalPages ? "default" : "pointer",
                fontFamily: T.fontUI,
              }}
            >
              Last
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: T.txt2, fontFamily: T.fontUI }}>Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(1);
            }}
            style={{
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              borderRadius: 4,
              color: T.txt,
              fontSize: 10,
              fontFamily: T.fontUI,
              padding: "2px 4px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── ER Diagram Table Card ───────────────────────────────────────────────────
function ERTableCard({ table, zoom, panOffset, onMouseDown }) {
  const headerH = 30;
  const rowH = 20;
  const h = headerH + table.columns.length * rowH + 8;

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, table.name)}
      style={{
        position: "absolute",
        left: table.x * zoom + panOffset.x,
        top: table.y * zoom + panOffset.y,
        width: (table.w || 240) * zoom,
        background: T.bg1,
        border: table.selected ? `2px solid ${T.teal}` : `1px solid ${T.border}`,
        borderRadius: 8 * zoom,
        overflow: "hidden",
        fontSize: 11 * zoom,
        fontFamily: T.fontUI,
        cursor: "move",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: table.selected ? 10 : 2,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: `${6 * zoom}px ${10 * zoom}px`,
          borderBottom: `1px solid ${T.border}`,
          background: T.bg2,
          gap: 6 * zoom,
        }}
      >
        <div
          style={{
            width: 3 * zoom,
            height: 16 * zoom,
            background: table.accent || T.teal,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 700, color: T.txt, flex: 1, fontSize: 11 * zoom }}>
          {table.name}
        </span>
        <span
          style={{
            fontSize: 9 * zoom,
            color: T.txt3,
            fontFamily: T.fontMono,
          }}
        >
          {table.columns.length} cols
        </span>
      </div>
      {/* Columns */}
      <div style={{ padding: `${2 * zoom}px 0` }}>
        {table.columns.map((col) => (
          <ERColumnRow key={col.name} col={col} zoom={zoom} />
        ))}
        {table.columns.length === 0 && (
          <div
            style={{
              padding: `${6 * zoom}px ${10 * zoom}px`,
              fontSize: 9 * zoom,
              color: T.txt3,
              fontStyle: "italic",
            }}
          >
            No columns
          </div>
        )}
      </div>
    </div>
  );
}

// ── ER Column Row (extracted to avoid hooks in .map) ────────────────────────
function ERColumnRow({ col, zoom }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: `${3 * zoom}px ${10 * zoom}px`,
        gap: 4 * zoom,
        fontSize: 10 * zoom,
      }}
    >
      <span style={{ width: 14 * zoom, textAlign: "center", fontSize: 9 * zoom, flexShrink: 0 }}>
        {col.pk ? (
          <span style={{ color: T.amber, fontWeight: 700, fontSize: 8 * zoom }}>PK</span>
        ) : col.fk ? (
          <span style={{ color: T.blue, fontWeight: 700, fontSize: 10 * zoom }}>{"\u2192"}</span>
        ) : (
          ""
        )}
      </span>
      <span
        style={{
          flex: 1,
          color: T.txt,
          fontFamily: T.fontMono,
          fontSize: 10 * zoom,
        }}
      >
        {col.name}
      </span>
      <span
        style={{
          color: T.txt3,
          fontFamily: T.fontMono,
          fontSize: 9 * zoom,
          textAlign: "right",
        }}
      >
        {col.type}
      </span>
    </div>
  );
}

// ── ER Diagram Sub-View ─────────────────────────────────────────────────────
function ERDiagramView({ schemaTables }) {
  const { activeConnection } = useKawaii();

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingTable, setDraggingTable] = useState(null);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const [selectedTable, setSelectedTable] = useState(null);

  // Build ER table positions from schema tables
  const ACCENT_COLORS = [T.teal, T.blue, T.green, T.amber, T.purple, T.red, T.cyan];

  const [tablePositions, setTablePositions] = useState({});

  // Auto-layout: position tables in a grid
  useEffect(() => {
    const pos = {};
    const cols = 3;
    const spacingX = 300;
    const spacingY = 280;
    schemaTables.forEach((tbl, i) => {
      if (!tablePositions[tbl.name]) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        pos[tbl.name] = { x: 60 + col * spacingX, y: 60 + row * spacingY };
      } else {
        pos[tbl.name] = tablePositions[tbl.name];
      }
    });
    setTablePositions(pos);
    // Only re-layout when tables are added/removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaTables.length]);

  const erTables = useMemo(() => {
    return schemaTables.map((tbl, i) => ({
      name: tbl.name,
      x: (tablePositions[tbl.name] || { x: 60 + (i % 3) * 300 }).x,
      y: (tablePositions[tbl.name] || { y: 60 + Math.floor(i / 3) * 280 }).y,
      w: 240,
      accent: ACCENT_COLORS[i % ACCENT_COLORS.length],
      selected: selectedTable === tbl.name,
      columns: tbl.columns || [],
    }));
  }, [schemaTables, tablePositions, selectedTable, ACCENT_COLORS]);

  // Build relationships from FK columns
  const relationships = useMemo(() => {
    const rels = [];
    const tableNames = new Set(schemaTables.map((t) => t.name));

    schemaTables.forEach((tbl) => {
      if (!tbl.columns) return;
      tbl.columns.forEach((col) => {
        if (col.fk && col.fkTable && tableNames.has(col.fkTable)) {
          rels.push({
            from: col.fkTable,
            fromField: col.fkColumn || "id",
            to: tbl.name,
            toField: col.name,
            label: "1 : N",
          });
        }
      });
    });

    return rels;
  }, [schemaTables]);

  const handleTableMouseDown = useCallback(
    (e, tableName) => {
      e.stopPropagation();
      setDraggingTable(tableName);
      setSelectedTable(tableName);
      dragStart.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (
        e.target === canvasRef.current ||
        e.target.tagName === "svg" ||
        e.target.tagName === "pattern" ||
        e.target.tagName === "rect" ||
        e.target.tagName === "circle"
      ) {
        setIsPanning(true);
        setSelectedTable(null);
        panStart.current = { x: e.clientX, y: e.clientY };
        panOffsetStart.current = { ...panOffset };
      }
    },
    [panOffset]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (draggingTable) {
        const dx = (e.clientX - dragStart.current.x) / zoom;
        const dy = (e.clientY - dragStart.current.y) / zoom;
        dragStart.current = { x: e.clientX, y: e.clientY };
        setTablePositions((prev) => {
          const old = prev[draggingTable] || { x: 0, y: 0 };
          return { ...prev, [draggingTable]: { x: old.x + dx, y: old.y + dy } };
        });
      } else if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPanOffset({
          x: panOffsetStart.current.x + dx,
          y: panOffsetStart.current.y + dy,
        });
      }
    },
    [isPanning, draggingTable, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingTable(null);
  }, []);

  // Get field Y offset within a table card
  const getFieldY = useCallback(
    (tableName, fieldName) => {
      const tbl = schemaTables.find((t) => t.name === tableName);
      if (!tbl || !tbl.columns) return 30;
      const headerH = 30;
      const rowH = 20;
      const idx = tbl.columns.findIndex((c) => c.name === fieldName);
      return headerH + (idx + 0.5) * rowH;
    },
    [schemaTables]
  );

  // Build SVG relationship paths
  const buildPaths = useMemo(() => {
    return relationships.map((rel, i) => {
      const fromPos = tablePositions[rel.from] || { x: 0, y: 0 };
      const toPos = tablePositions[rel.to] || { x: 0, y: 0 };
      const fromFieldY = getFieldY(rel.from, rel.fromField);
      const toFieldY = getFieldY(rel.to, rel.toField);
      const w = 240;

      if (rel.from === rel.to) {
        // Self-referencing curve
        const x = (fromPos.x + w) * zoom + panOffset.x;
        const y1 = (fromPos.y + fromFieldY) * zoom + panOffset.y;
        const loopW = 60 * zoom;
        const loopH = 40 * zoom;
        const y2 = (toPos.y + toFieldY) * zoom + panOffset.y;
        const path = `M ${x} ${y1} C ${x + loopW} ${y1 - loopH}, ${x + loopW} ${y2 + loopH}, ${x} ${y2}`;
        const midX = x + loopW * 0.7;
        const midY = (y1 + y2) / 2;
        return { path, midX, midY, label: rel.label, key: i };
      }

      let x1, y1, x2, y2;
      const fromCenterX = fromPos.x + w / 2;
      const toCenterX = toPos.x + w / 2;

      if (fromCenterX < toCenterX) {
        x1 = (fromPos.x + w) * zoom + panOffset.x;
        y1 = (fromPos.y + fromFieldY) * zoom + panOffset.y;
        x2 = toPos.x * zoom + panOffset.x;
        y2 = (toPos.y + toFieldY) * zoom + panOffset.y;
      } else {
        x1 = fromPos.x * zoom + panOffset.x;
        y1 = (fromPos.y + fromFieldY) * zoom + panOffset.y;
        x2 = (toPos.x + w) * zoom + panOffset.x;
        y2 = (toPos.y + toFieldY) * zoom + panOffset.y;
      }

      const cpx = (x1 + x2) / 2;
      const path = `M ${x1} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x2} ${y2}`;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      return { path, midX, midY, label: rel.label, key: i, x1, y1, x2, y2 };
    });
  }, [zoom, panOffset, tablePositions, relationships, getFieldY]);

  // Omnidirectional scroll via trackpad / mouse wheel
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      // If pinch-to-zoom (ctrlKey on trackpad), adjust zoom
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.005;
        setZoom((z) => Math.min(2, Math.max(0.15, z + delta)));
      } else {
        // Normal scroll — pan the canvas
        setPanOffset((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    },
    []
  );

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleFitToScreen = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleAutoLayout = useCallback(() => {
    const pos = {};
    const cols = 3;
    const spacingX = 300;
    const spacingY = 280;
    schemaTables.forEach((tbl, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos[tbl.name] = { x: 60 + col * spacingX, y: 60 + row * spacingY };
    });
    setTablePositions(pos);
    setPanOffset({ x: 0, y: 0 });
  }, [schemaTables]);

  const dbName = activeConnection ? (activeConnection.database || "default") : "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
          gap: 8,
        }}
      >
        <div style={{ width: 3, height: 18, background: T.teal, borderRadius: 2 }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: T.txt,
            fontFamily: T.fontUI,
            textTransform: "uppercase",
          }}
        >
          ER DIAGRAM
        </span>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontUI, marginLeft: 4 }}>
          {dbName}
        </span>
        <span
          style={{
            fontSize: 9,
            color: T.teal,
            background: `${T.teal}18`,
            padding: "1px 6px",
            borderRadius: 9,
            fontWeight: 600,
            marginLeft: 4,
          }}
        >
          {schemaTables.length} tables
        </span>
        <div style={{ flex: 1 }} />
        {/* Zoom controls */}
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}
          style={{
            width: 24,
            height: 22,
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.txt2,
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          -
        </button>
        <span
          style={{
            fontSize: 10,
            color: T.txt2,
            fontFamily: T.fontMono,
            minWidth: 36,
            textAlign: "center",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          style={{
            width: 24,
            height: 22,
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.txt2,
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
        <div style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />
        <button
          onClick={handleAutoLayout}
          style={{
            padding: "3px 10px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.txt2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: T.fontUI,
            fontWeight: 500,
          }}
        >
          Auto Layout
        </button>
        <button
          onClick={handleFitToScreen}
          style={{
            padding: "3px 10px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.txt2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: T.fontUI,
            fontWeight: 500,
          }}
        >
          Fit to Screen
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: draggingTable ? "grabbing" : isPanning ? "grabbing" : "grab",
          background: T.bg0,
        }}
      >
        {/* Dot grid background */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <defs>
            <pattern id="dotGrid" width={20} height={20} patternUnits="userSpaceOnUse">
              <circle cx={10} cy={10} r={1} fill={T.border} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotGrid)" />
        </svg>

        {schemaTables.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
              zIndex: 5,
            }}
          >
            <div style={{ fontSize: 28, opacity: 0.2 }}>{"\u26C1"}</div>
            <div style={{ fontSize: 13, color: T.txt2, fontFamily: T.fontUI, fontWeight: 600 }}>
              No tables in schema
            </div>
            <div style={{ fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
              Add tables from the schema tree to see them here.
            </div>
          </div>
        )}

        {/* Relationship lines SVG */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {buildPaths.map((p) => (
            <g key={p.key}>
              <path
                d={p.path}
                fill="none"
                stroke={`${T.blue}99`}
                strokeWidth={1.5}
              />
              {/* "1" end marker (open circle) */}
              {p.x1 !== undefined && (
                <circle
                  cx={p.x1}
                  cy={p.y1}
                  r={4}
                  fill="none"
                  stroke={`${T.blue}99`}
                  strokeWidth={1.5}
                />
              )}
              {/* "N" end marker (filled circle) */}
              {p.x2 !== undefined && (
                <circle
                  cx={p.x2}
                  cy={p.y2}
                  r={4}
                  fill={`${T.blue}99`}
                  stroke={`${T.blue}99`}
                  strokeWidth={1.5}
                />
              )}
              {/* Label */}
              <rect
                x={p.midX - 16}
                y={p.midY - 8}
                width={32}
                height={16}
                rx={4}
                fill={T.bg2}
                stroke={T.border}
                strokeWidth={0.5}
              />
              <text
                x={p.midX}
                y={p.midY + 3}
                textAnchor="middle"
                fill={T.blue}
                fontSize={8}
                fontFamily={T.fontUI}
                fontWeight={600}
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Table cards */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {erTables.map((table) => (
            <ERTableCard
              key={table.name}
              table={table}
              zoom={zoom}
              panOffset={panOffset}
              onMouseDown={handleTableMouseDown}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── No Connection Empty State ───────────────────────────────────────────────
function NoConnectionState() {
  return (
    <div
      className="screen-enter"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.15 }}>{"\u26C1"}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: T.txt,
          fontFamily: T.fontUI,
        }}
      >
        No Active Connection
      </div>
      <div
        style={{
          fontSize: 12,
          color: T.txt3,
          fontFamily: T.fontUI,
          textAlign: "center",
          maxWidth: 340,
          lineHeight: 1.6,
        }}
      >
        Select a connection from the dropdown in the navigation bar, or go to the Connections tab to create one.
      </div>
    </div>
  );
}

// ── Main ScreenNavigator Component ──────────────────────────────────────────
function ScreenNavigator() {
  const { activeConnection, navigatorView, setNavigatorView, activeTable, setActiveTable } = useKawaii();

  const [expandedNodes, setExpandedNodes] = useState(
    () => new Set(["connection", "db-main", "folder-tables"])
  );

  // Schema state: loaded from real database via IPC
  const [schemaTables, setSchemaTables] = useState([]);
  const [schemaViews, setSchemaViews] = useState([]);
  const [schemaSPs, setSchemaSPs] = useState([]);
  const [schemaFunctions, setSchemaFunctions] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Fetch real schema when connection changes
  useEffect(() => {
    setSchemaTables([]);
    setSchemaViews([]);
    setSchemaSPs([]);
    setSchemaFunctions([]);
    setActiveTable(null);

    if (!activeConnection || activeConnection.status !== "online") return;

    let cancelled = false;
    (async () => {
      setSchemaLoading(true);
      try {
        const schema = await window.akatsuki.kawaiidb.fetchSchema({ connectionId: activeConnection.id });
        if (cancelled) return;
        if (schema && !schema.error) {
          if (schema.tables) setSchemaTables(schema.tables);
          if (schema.views) setSchemaViews(schema.views);
          if (schema.storedProcedures) setSchemaSPs(schema.storedProcedures);
          if (schema.functions) setSchemaFunctions(schema.functions);
        }
      } catch {}
      if (!cancelled) setSchemaLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeConnection?.id, setActiveTable]);

  const toggleNode = useCallback((key) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectTable = useCallback(
    (tableName) => {
      setActiveTable(tableName);
      setNavigatorView("table");
    },
    [setActiveTable, setNavigatorView]
  );

  const handleAddTable = useCallback((name) => {
    setSchemaTables((prev) => {
      if (prev.find((t) => t.name === name)) return prev;
      return [...prev, { name, columns: [] }];
    });
  }, []);

  const handleAddView = useCallback((name) => {
    setSchemaViews((prev) => {
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  const handleAddSP = useCallback((name) => {
    setSchemaSPs((prev) => {
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  const handleAddFunction = useCallback((name) => {
    setSchemaFunctions((prev) => {
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  // No connection: show full-screen empty state
  if (!activeConnection) {
    return <NoConnectionState />;
  }

  // Render active sub-view
  const renderSubView = () => {
    switch (navigatorView) {
      case "editor":
        return <SQLEditorView />;
      case "table":
        return <TableDataView activeTable={activeTable} schemaTables={schemaTables} />;
      case "er-diagram":
        return <ERDiagramView schemaTables={schemaTables} />;
      default:
        return <SQLEditorView />;
    }
  };

  return (
    <div
      className="screen-enter"
      style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Schema Tree Sidebar */}
      <SchemaTreeSidebar
        expandedNodes={expandedNodes}
        toggleNode={toggleNode}
        activeTable={activeTable}
        onSelectTable={handleSelectTable}
        schemaTables={schemaTables}
        schemaViews={schemaViews}
        schemaSPs={schemaSPs}
        schemaFunctions={schemaFunctions}
        onAddTable={handleAddTable}
        onAddView={handleAddView}
        onAddSP={handleAddSP}
        onAddFunction={handleAddFunction}
      />

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Sub-view toggle bar */}
        <div
          style={{
            height: 32,
            minHeight: 32,
            display: "flex",
            alignItems: "center",
            background: T.bg2,
            borderBottom: `1px solid ${T.border}`,
            padding: "0 12px",
            gap: 0,
          }}
        >
          {[
            { id: "editor", label: "SQL Editor" },
            { id: "table", label: "Table Data" },
            { id: "er-diagram", label: "ER Diagram" },
          ].map((view) => {
            const isActive = navigatorView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setNavigatorView(view.id)}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  padding: "0 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.fontUI,
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? T.txt : T.txt2,
                  outline: "none",
                }}
              >
                {view.label}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 14,
                      right: 14,
                      height: 2,
                      background: T.teal,
                      borderRadius: "1px 1px 0 0",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-view content */}
        {renderSubView()}
      </div>
    </div>
  );
}

export default ScreenNavigator;

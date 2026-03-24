import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Input } from "../components";
import { useShinra, highlightTS, highlightLine } from "./ShinraApp";
import { resolveReference } from "./resolveReference";

// ── File extension → icon / color mapping ───────────────────────────────────
const EXT_META = {
  js:   { icon: "JS", color: T.amber },
  jsx:  { icon: "⚛",  color: T.cyan },
  ts:   { icon: "TS", color: T.blue },
  tsx:  { icon: "⚛",  color: T.blue },
  json: { icon: "{}",  color: T.amber },
  md:   { icon: "M",  color: T.txt2 },
  css:  { icon: "#",  color: T.purple },
  scss: { icon: "#",  color: T.purple },
  html: { icon: "<>", color: T.red },
  py:   { icon: "Py", color: T.green },
  rs:   { icon: "Rs", color: T.red },
  go:   { icon: "Go", color: T.cyan },
  sh:   { icon: "$",  color: T.green },
  yml:  { icon: "Y",  color: T.red },
  yaml: { icon: "Y",  color: T.red },
  toml: { icon: "T",  color: T.amber },
  lock: { icon: "🔒", color: T.txt3 },
  svg:  { icon: "◇",  color: T.amber },
  png:  { icon: "▣",  color: T.green },
  jpg:  { icon: "▣",  color: T.green },
  gif:  { icon: "▣",  color: T.green },
  env:  { icon: "•",  color: T.amber },
  gitignore: { icon: "G", color: T.red },
};

function getExtMeta(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return EXT_META[ext] || { icon: "·", color: T.txt3 };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function basename(p) {
  return p ? p.split("/").pop() || p : "";
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ── FileTreeItem (extracted to avoid hooks-in-map) ──────────────────────────
function FileTreeItem({ entry, depth, onFileClick, activeFile }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleDir = useCallback(async () => {
    if (!entry.isDir) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (children === null) {
      setLoading(true);
      try {
        const res = await window.akatsuki.shinra.readDir(entry.path);
        setChildren(sortEntries(res.entries || []));
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }
    setExpanded(true);
  }, [entry, expanded, children]);

  const handleClick = useCallback(() => {
    if (entry.isDir) {
      toggleDir();
    } else {
      onFileClick(entry.path);
    }
  }, [entry, toggleDir, onFileClick]);

  const isActive = !entry.isDir && entry.path === activeFile;
  const meta = entry.isDir ? null : getExtMeta(entry.name);
  const indent = 12 + depth * 16;

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 26,
          paddingLeft: indent,
          paddingRight: 8,
          cursor: "pointer",
          background: isActive ? `${T.blue}18` : "transparent",
          borderLeft: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
          fontSize: 12,
          fontFamily: T.fontUI,
          color: isActive ? T.txt : T.txt2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "background 0.1s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = `${T.bg3}80`;
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {entry.isDir ? (
          <>
            <span style={{ fontSize: 10, color: T.txt3, width: 12, textAlign: "center", flexShrink: 0 }}>
              {loading ? "…" : expanded ? "▾" : "▸"}
            </span>
            <span style={{ fontSize: 11, flexShrink: 0 }}>📁</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: meta.color,
              width: 18,
              textAlign: "center",
              flexShrink: 0,
              fontFamily: T.fontMono,
            }}>
              {meta.icon}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
          </>
        )}
      </div>

      {entry.isDir && expanded && children && children.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onFileClick={onFileClick}
          activeFile={activeFile}
        />
      ))}
    </>
  );
}

// ── EditorTab (extracted to avoid hooks-in-map) ─────────────────────────────
function EditorTab({ filePath, isActive, onSelect, onClose, modified }) {
  const [hov, setHov] = useState(false);
  const name = basename(filePath);
  const meta = getExtMeta(name);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: "100%",
        padding: "0 12px",
        cursor: "pointer",
        background: isActive ? T.bg1 : hov ? T.bg2 : "transparent",
        borderRight: `1px solid ${T.border}`,
        borderBottom: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
        fontSize: 11,
        fontFamily: T.fontUI,
        color: isActive ? T.txt : T.txt2,
        whiteSpace: "nowrap",
        userSelect: "none",
        position: "relative",
      }}
    >
      <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, fontFamily: T.fontMono }}>
        {meta.icon}
      </span>
      <span>{name}</span>
      {modified && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, flexShrink: 0 }} />
      )}
      <span
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          fontSize: 12,
          color: T.txt3,
          marginLeft: 2,
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          transition: "background 0.1s, color 0.1s",
          ...(hov || isActive ? {} : { opacity: 0 }),
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.bg4; e.currentTarget.style.color = T.txt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.txt3; }}
      >
        ×
      </span>
    </div>
  );
}

// ── CodeLine (extracted to avoid hooks-in-map) ──────────────────────────────
// Helper: determine if a token is an identifier (for Cmd+hover underline)
function isIdentifier(tok) {
  return tok.color !== T.txt3       // not comment
    && tok.color !== T.green        // not string
    && tok.color !== T.amber        // not number
    && tok.color !== T.txt2         // not operator/punctuation
    && !tok.bold                    // not keyword
    && /^[a-zA-Z_$]/.test(tok.text) // starts like an identifier
    && tok.text.length >= 2;        // at least 2 chars
}

function CodeLine({ lineNum, text, gutterWidth, ext }) {
  const tokens = useMemo(() => highlightLine(text, ext || "ts"), [text, ext]);

  return (
    <div style={{ display: "flex", minHeight: 20, lineHeight: "20px" }}>
      <span style={{
        width: gutterWidth,
        minWidth: gutterWidth,
        textAlign: "right",
        paddingRight: 12,
        color: T.txt3,
        fontSize: 12,
        fontFamily: T.fontMono,
        userSelect: "none",
        flexShrink: 0,
      }}>
        {lineNum}
      </span>
      <span style={{ flex: 1, whiteSpace: "pre", fontSize: 13, fontFamily: T.fontMono, tabSize: 2 }}>
        {tokens.map((tok, i) => (
          <span
            key={i}
            className={isIdentifier(tok) ? "shinra-token-id" : undefined}
            style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : 400 }}
          >{tok.text}</span>
        ))}
      </span>
    </div>
  );
}

// ── TerminalOutput (extracted to avoid hooks-in-map) ─────────────────────────
function TerminalOutput({ text, type }) {
  const color = type === "stderr" ? T.red : T.txt2;
  return (
    <span style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{text}</span>
  );
}

// ── AI Suggestion Bubble ────────────────────────────────────────────────────
function AISuggestion({ text, onApply, onDismiss }) {
  return (
    <div style={{
      margin: "6px 0", padding: "8px 12px", borderRadius: 8,
      background: `${T.purple}12`, border: `1px solid ${T.purple}30`,
      fontSize: 12, fontFamily: T.fontUI, lineHeight: 1.6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.purple }}>AI Assistant</span>
      </div>
      <div style={{ color: T.txt2, fontFamily: T.fontMono, fontSize: 11, whiteSpace: "pre-wrap" }}>{text}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {onApply && (
          <Btn variant="ghost" onClick={onApply} style={{ height: 22, fontSize: 10, padding: "0 10px", color: T.purple, border: `1px solid ${T.purple}40` }}>
            Run Suggestion
          </Btn>
        )}
        <Btn variant="ghost" onClick={onDismiss} style={{ height: 22, fontSize: 10, padding: "0 8px" }}>
          Dismiss
        </Btn>
      </div>
    </div>
  );
}

// ── Minimap ─────────────────────────────────────────────────────────────────
function Minimap({ lines, scrollTop, visibleLines, totalHeight, onSeek }) {
  const canvasRef = useRef(null);
  const SCALE = 2; // pixels per line in minimap
  const WIDTH = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lines.length) return;
    const ctx = canvas.getContext("2d");
    const h = lines.length * SCALE;
    canvas.width = WIDTH;
    canvas.height = Math.min(h, 2000);
    ctx.fillStyle = T.bg1;
    ctx.fillRect(0, 0, WIDTH, canvas.height);

    lines.forEach((line, i) => {
      if (i * SCALE > canvas.height) return;
      const trimmed = line.trimStart();
      if (!trimmed) return;
      const indent = line.length - trimmed.length;
      const x = Math.min(indent * 1.5, 20);
      const w = Math.min(trimmed.length * 0.6, WIDTH - x - 2);
      // Color based on content
      let color = `${T.txt3}60`;
      if (/^\s*(import|export|from)\b/.test(line)) color = `${T.purple}50`;
      else if (/^\s*(function|class|const|let|var)\b/.test(line)) color = `${T.blue}60`;
      else if (/^\s*\/\//.test(line)) color = `${T.txt3}40`;
      else if (/^\s*(if|else|for|while|return|switch)\b/.test(line)) color = `${T.cyan}50`;
      else if (/["'`]/.test(line)) color = `${T.green}40`;
      ctx.fillStyle = color;
      ctx.fillRect(x, i * SCALE, Math.max(w, 3), SCALE - 0.5);
    });
  }, [lines]);

  // Viewport indicator
  const mapHeight = Math.min(lines.length * SCALE, 2000);
  const viewRatio = totalHeight > 0 ? mapHeight / totalHeight : 0;
  const viewTop = scrollTop * viewRatio;
  const viewH = Math.max(visibleLines * SCALE, 20);

  const handleClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const lineIdx = Math.floor(y / SCALE);
    if (onSeek) onSeek(lineIdx);
  }, [onSeek]);

  return (
    <div
      onClick={handleClick}
      style={{
        width: WIDTH,
        minWidth: WIDTH,
        background: T.bg1,
        borderLeft: `1px solid ${T.border}`,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <canvas ref={canvasRef} style={{ width: WIDTH, display: "block" }} />
      <div style={{
        position: "absolute",
        top: viewTop,
        left: 0,
        right: 0,
        height: viewH,
        background: `${T.blue}15`,
        border: `1px solid ${T.blue}30`,
        borderRadius: 1,
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ── Markdown Preview helpers ─────────────────────────────────────────────────
function renderInline(text) {
  if (!text) return text;
  const parts = [];
  let remaining = text;
  let safetyCounter = 0;

  while (remaining.length > 0 && safetyCounter < 500) {
    safetyCounter++;

    // Image: ![alt](url)
    const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      parts.push(
        <img
          key={parts.length}
          src={imgMatch[2]}
          alt={imgMatch[1]}
          style={{ maxWidth: "100%", borderRadius: 6 }}
        />
      );
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={parts.length} href={linkMatch[2]} style={{ color: T.blue, textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<span key={parts.length} style={{ fontWeight: 700 }}>{renderInline(boldMatch[1])}</span>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Bold: __text__
    const boldMatch2 = remaining.match(/^__(.+?)__/);
    if (boldMatch2) {
      parts.push(<span key={parts.length} style={{ fontWeight: 700 }}>{renderInline(boldMatch2[1])}</span>);
      remaining = remaining.slice(boldMatch2[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      parts.push(<span key={parts.length} style={{ fontStyle: "italic" }}>{renderInline(italicMatch[1])}</span>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={parts.length} style={{
          background: T.bg3, color: T.green, fontFamily: T.fontMono,
          padding: "2px 6px", borderRadius: 3, fontSize: 12,
        }}>
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      parts.push(<span key={parts.length} style={{ textDecoration: "line-through", color: T.txt3 }}>{renderInline(strikeMatch[1])}</span>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Plain text — consume until next special character
    const nextSpecial = remaining.slice(1).search(/[*_`~!\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else {
      parts.push(remaining.slice(0, nextSpecial + 1));
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

function renderMdCodeBlock(codeLines, lang, key) {
  return (
    <div key={key} style={{
      background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: "12px 16px", margin: "8px 0", overflow: "auto", position: "relative",
    }}>
      {lang && lang !== "text" && (
        <span style={{
          position: "absolute", top: 6, right: 10,
          fontSize: 9, color: T.txt3, fontFamily: T.fontMono,
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          {lang}
        </span>
      )}
      <div style={{ fontFamily: T.fontMono, fontSize: 12, lineHeight: "20px" }}>
        {codeLines.map((line, i) => {
          const tokens = highlightLine(line, lang || "text");
          return (
            <div key={i} style={{ display: "flex", minHeight: 20 }}>
              <span style={{
                width: 32, minWidth: 32, textAlign: "right", paddingRight: 12,
                color: T.txt3, fontSize: 11, userSelect: "none", flexShrink: 0, opacity: 0.5,
              }}>
                {i + 1}
              </span>
              <span style={{ whiteSpace: "pre", tabSize: 2 }}>
                {tokens.map((tok, j) => (
                  <span key={j} style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : 400 }}>{tok.text}</span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderMdTable(rows, key) {
  if (rows.length === 0) return null;
  const headerRow = rows[0];
  const bodyRows = rows.slice(1);
  return (
    <table key={key} style={{
      borderCollapse: "collapse", width: "100%", fontSize: 13,
      margin: "8px 0", fontFamily: T.fontUI,
    }}>
      <thead>
        <tr>
          {headerRow.map((cell, i) => (
            <th key={i} style={{
              padding: "6px 12px", border: `1px solid ${T.border}`,
              background: T.bg2, fontWeight: 700, color: T.txt, textAlign: "left",
            }}>
              {renderInline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                padding: "6px 12px", border: `1px solid ${T.border}`,
                background: ri % 2 === 0 ? T.bg1 : "transparent", color: T.txt,
              }}>
                {renderInline(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderMdBlockquote(bqLines, key) {
  return (
    <div key={key} style={{
      borderLeft: `3px solid ${T.purple}`, background: T.bg1,
      padding: "10px 16px", margin: "8px 0", borderRadius: "0 6px 6px 0",
    }}>
      {bqLines.map((l, i) => (
        <div key={i} style={{ color: T.txt2, fontStyle: "italic", lineHeight: 1.7 }}>
          {renderInline(l)}
        </div>
      ))}
    </div>
  );
}

function renderMdList(items, type, key) {
  return (
    <div key={key} style={{ margin: "8px 0", paddingLeft: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, lineHeight: 1.7, color: T.txt }}>
          <span style={{ color: T.amber, fontWeight: 700, flexShrink: 0, fontFamily: T.fontMono, fontSize: 12, minWidth: 16, textAlign: "right" }}>
            {type === "ol" ? `${i + 1}.` : "\u25CF"}
          </span>
          <span>{renderInline(item)}</span>
        </div>
      ))}
    </div>
  );
}

function MarkdownPreview({ content }) {
  const elements = useMemo(() => {
    const mdLines = content.split("\n");
    const result = [];
    let i = 0;
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockLines = [];
    let tableRows = [];
    let listItems = [];
    let listType = null; // "ul" | "ol"
    let blockquoteLines = [];

    function flushList() {
      if (listItems.length > 0) {
        result.push(renderMdList(listItems, listType, result.length));
        listItems = [];
        listType = null;
      }
    }
    function flushBlockquote() {
      if (blockquoteLines.length > 0) {
        result.push(renderMdBlockquote(blockquoteLines, result.length));
        blockquoteLines = [];
      }
    }
    function flushTable() {
      if (tableRows.length > 0) {
        result.push(renderMdTable(tableRows, result.length));
        tableRows = [];
      }
    }

    while (i < mdLines.length) {
      const line = mdLines[i];
      const trimmed = line.trim();

      // Code blocks: ```lang ... ```
      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          result.push(renderMdCodeBlock(codeBlockLines, codeBlockLang, result.length));
          inCodeBlock = false;
          codeBlockLines = [];
        } else {
          flushList(); flushBlockquote(); flushTable();
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim() || "text";
        }
        i++; continue;
      }
      if (inCodeBlock) { codeBlockLines.push(line); i++; continue; }

      // Blank line
      if (!trimmed) {
        flushList(); flushBlockquote(); flushTable();
        result.push(<div key={result.length} style={{ height: 12 }} />);
        i++; continue;
      }

      // Headings: # through ######
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        flushList(); flushBlockquote(); flushTable();
        const level = headingMatch[1].length;
        const sizes = [28, 22, 18, 16, 14, 13];
        result.push(
          <div key={result.length} style={{
            fontSize: sizes[level - 1], fontWeight: 700, color: T.txt,
            marginTop: level <= 2 ? 24 : 16, marginBottom: 8,
            paddingBottom: level <= 2 ? 8 : 0,
            borderBottom: level <= 2 ? `1px solid ${T.border}` : "none",
          }}>
            {renderInline(headingMatch[2])}
          </div>
        );
        i++; continue;
      }

      // Blockquotes: > text
      if (trimmed.startsWith("> ") || trimmed === ">") {
        flushList(); flushTable();
        blockquoteLines.push(trimmed.slice(2) || "");
        i++; continue;
      }

      // Unordered lists: - or * or +
      if (/^[-*+]\s/.test(trimmed)) {
        flushBlockquote(); flushTable();
        if (listType !== "ul") { flushList(); listType = "ul"; }
        listItems.push(trimmed.slice(2));
        i++; continue;
      }

      // Ordered lists: 1. 2. etc
      if (/^\d+\.\s/.test(trimmed)) {
        flushBlockquote(); flushTable();
        if (listType !== "ol") { flushList(); listType = "ol"; }
        listItems.push(trimmed.replace(/^\d+\.\s/, ""));
        i++; continue;
      }

      // Tables: | col1 | col2 |
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList(); flushBlockquote();
        // Skip separator rows (|---|---|)
        if (/^\|[\s\-:|]+\|$/.test(trimmed)) { i++; continue; }
        tableRows.push(trimmed.split("|").slice(1, -1).map(c => c.trim()));
        i++; continue;
      }

      // Horizontal rules: --- or *** or ___
      if (/^[-*_]{3,}$/.test(trimmed)) {
        flushList(); flushBlockquote(); flushTable();
        result.push(<hr key={result.length} style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "16px 0" }} />);
        i++; continue;
      }

      // Checkbox list items: - [x] or - [ ]
      const checkboxMatch = trimmed.match(/^[-*+]\s\[([ xX])\]\s(.+)/);
      if (checkboxMatch) {
        flushBlockquote(); flushTable();
        if (listType !== "ul") { flushList(); listType = "ul"; }
        const checked = checkboxMatch[1] !== " ";
        listItems.push(
          <span>
            <span style={{ fontFamily: T.fontMono, color: checked ? T.green : T.txt3, marginRight: 6 }}>
              {checked ? "\u2611" : "\u2610"}
            </span>
            {renderInline(checkboxMatch[2])}
          </span>
        );
        i++; continue;
      }

      // Regular paragraph
      flushList(); flushBlockquote(); flushTable();
      result.push(
        <p key={result.length} style={{ margin: "8px 0", lineHeight: 1.7, color: T.txt }}>
          {renderInline(trimmed)}
        </p>
      );
      i++;
    }

    // Flush remaining
    flushList(); flushBlockquote(); flushTable();
    if (inCodeBlock) result.push(renderMdCodeBlock(codeBlockLines, codeBlockLang, result.length));

    return result;
  }, [content]);

  return (
    <div style={{
      padding: "24px 32px", fontFamily: T.fontUI, fontSize: 14, color: T.txt,
      lineHeight: 1.7, maxWidth: 800, overflowY: "auto", height: "100%",
    }}>
      {elements}
    </div>
  );
}

// ── DefPopupItem (extracted to avoid hooks-in-map) ───────────────────────
function DefPopupItem({ m, onNavigate }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={() => onNavigate(m)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "4px 8px", cursor: "pointer", borderRadius: 4,
        display: "flex", alignItems: "center", gap: 8,
        background: hov ? T.bg3 : "transparent",
      }}
    >
      <span style={{ fontSize: 11, color: T.blue, fontWeight: 600, fontFamily: T.fontMono }}>{m.name}</span>
      <span style={{ fontSize: 10, color: T.txt3 }}>{m.file.split("/").pop()}:{m.line}</span>
      <span style={{ fontSize: 9, color: T.purple, marginLeft: "auto" }}>{m.type}</span>
    </div>
  );
}

// ── Main ScreenEditor ───────────────────────────────────────────────────────
function ScreenEditor() {
  const {
    workingDir, setWorkingDir,
    openFiles, setOpenFiles,
    activeFile, setActiveFile,
    filePaletteOpen, setFilePaletteOpen,
    invalidateFile,
    symbolIndex, routeIndex,
    fileIndex, stubIndex, importResolutionCache,
  } = useShinra();

  // File tree state
  const [treeEntries, setTreeEntries] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Editor content
  const [fileContents, setFileContents] = useState({}); // path -> { content, original, modified }
  const [saving, setSaving] = useState(false);

  // Terminal state — persistent shell
  const [termOpen, setTermOpen] = useState(true);
  const [termOutput, setTermOutput] = useState(""); // raw terminal output
  const [termInput, setTermInput] = useState("");
  const [shellActive, setShellActive] = useState(false);
  const [cmdHistory, setCmdHistory] = useState(() => {
    try { const h = localStorage.getItem("shinra:cmd-history"); return h ? JSON.parse(h) : []; } catch { return []; }
  });
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Go-to-definition popup
  const [defPopup, setDefPopup] = useState(null); // { x, y, matches: [{file, line, name, type}] }
  const [pendingGoToLine, setPendingGoToLine] = useState(null);

  // Editor scroll state
  const editorRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [editorHeight, setEditorHeight] = useState(400);
  const [cmdHeld, setCmdHeld] = useState(false);

  // Find in file
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatches, setFindMatches] = useState(0);
  const [findCurrent, setFindCurrent] = useState(0);
  const findInputRef = useRef(null);

  // Markdown preview mode
  const [mdPreviewMode, setMdPreviewMode] = useState("code"); // "code" | "split" | "preview"

  // ── Active file extension (needed early for keyboard shortcuts) ──────────
  const activeExt = useMemo(() => {
    if (!activeFile) return "ts";
    const parts = activeFile.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "ts";
  }, [activeFile]);
  const isMarkdown = activeExt === "md";

  // ── Load tree when workingDir changes ─────────────────────────────────────
  useEffect(() => {
    if (!workingDir) {
      setTreeEntries([]);
      return;
    }
    let canceled = false;
    (async () => {
      setTreeLoading(true);
      try {
        const res = await window.akatsuki.shinra.readDir(workingDir);
        if (!canceled) setTreeEntries(sortEntries(res.entries || []));
      } catch {
        if (!canceled) setTreeEntries([]);
      }
      if (!canceled) setTreeLoading(false);
    })();
    return () => { canceled = true; };
  }, [workingDir]);

  // ── Open folder ───────────────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const res = await window.akatsuki.shinra.selectFolder();
      if (res && !res.canceled && res.path) {
        setWorkingDir(res.path);
        setOpenFiles([]);
        setActiveFile(null);
        setFileContents({});
      }
    } catch {}
  }, [setWorkingDir, setOpenFiles, setActiveFile]);

  // ── Open file in editor ───────────────────────────────────────────────────
  const handleFileClick = useCallback(async (filePath) => {
    // Add to open tabs if not already there
    setOpenFiles((prev) => {
      if (prev.includes(filePath)) return prev;
      return [...prev, filePath];
    });
    setActiveFile(filePath);

    // Load content if not cached
    if (!fileContents[filePath]) {
      try {
        const res = await window.akatsuki.shinra.readFile(filePath);
        setFileContents((prev) => ({
          ...prev,
          [filePath]: {
            content: res.content || "",
            original: res.content || "",
            size: res.size,
            modified: false,
          },
        }));
      } catch {
        setFileContents((prev) => ({
          ...prev,
          [filePath]: {
            content: "// Error reading file",
            original: "",
            size: 0,
            modified: false,
          },
        }));
      }
    }
  }, [fileContents, setOpenFiles, setActiveFile]);

  // ── Auto-load content when activeFile changes (e.g. opened from Search) ──
  useEffect(() => {
    if (!activeFile || fileContents[activeFile]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await window.akatsuki.shinra.readFile(activeFile);
        if (cancelled) return;
        setFileContents((prev) => ({
          ...prev,
          [activeFile]: {
            content: res.content || "",
            original: res.content || "",
            size: res.size,
            modified: false,
          },
        }));
      } catch {
        if (cancelled) return;
        setFileContents((prev) => ({
          ...prev,
          [activeFile]: {
            content: "// Error reading file",
            original: "",
            size: 0,
            modified: false,
          },
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile, fileContents]);

  // ── Close tab ─────────────────────────────────────────────────────────────
  const handleCloseTab = useCallback((filePath) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== filePath);
      if (filePath === activeFile) {
        setActiveFile(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
    setFileContents((prev) => {
      const copy = { ...prev };
      delete copy[filePath];
      return copy;
    });
  }, [activeFile, setOpenFiles, setActiveFile]);

  // ── Handle content edit ───────────────────────────────────────────────────
  const handleContentChange = useCallback((e) => {
    if (!activeFile) return;
    const newContent = e.target.value;
    setFileContents((prev) => ({
      ...prev,
      [activeFile]: {
        ...prev[activeFile],
        content: newContent,
        modified: newContent !== prev[activeFile]?.original,
      },
    }));
  }, [activeFile]);

  // ── Scroll parent to keep textarea cursor in view ─────────────────────────
  const handleEditorKeyDown = useCallback((e) => {
    // After key press, check if we need to scroll to keep cursor visible
    setTimeout(() => {
      const textarea = e.target;
      const scrollEl = editorRef.current;
      if (!textarea || !scrollEl) return;
      const cursorPos = textarea.selectionStart;
      const textBefore = (textarea.value || "").slice(0, cursorPos);
      const linesBefore = textBefore.split("\n").length - 1;
      const cursorY = linesBefore * 20; // 20px per line
      const viewTop = scrollEl.scrollTop;
      const viewBottom = viewTop + scrollEl.clientHeight;
      if (cursorY < viewTop + 40) {
        scrollEl.scrollTop = Math.max(0, cursorY - 40);
      } else if (cursorY + 24 > viewBottom - 40) {
        scrollEl.scrollTop = cursorY + 64 - scrollEl.clientHeight;
      }
    }, 0);
  }, []);

  // ── Cmd+Click go-to-definition ──────────────────────────────────────────
  const getLineAtClick = useCallback((e) => {
    const el = editorRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top + el.scrollTop;
    return Math.floor(y / 20) + 1;
  }, []);

  const handleCodeClick = useCallback((e) => {
    // Only on Cmd+Click (Mac) or Ctrl+Click (non-Mac)
    if (!(e.metaKey || e.ctrlKey)) {
      setDefPopup(null);
      return;
    }

    // Get clicked word from the DOM
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent || "";
    const offset = range.startOffset;

    // Extract word at click position
    let start = offset;
    let end = offset;
    while (start > 0 && /[a-zA-Z0-9_$]/.test(text[start - 1])) start--;
    while (end < text.length && /[a-zA-Z0-9_$]/.test(text[end])) end++;
    const word = text.slice(start, end);

    if (!word || word.length < 2) return;

    const clickedLine = getLineAtClick(e);

    // Check if it's an API path string (quoted string containing /api/)
    const fullLine = node.parentElement?.closest("[style]")?.textContent || "";
    const apiPathMatch = fullLine.match(/['"`]([^'"`]*\/api\/[^'"`]*)['"`]/);

    let matches = [];

    if (apiPathMatch && routeIndex) {
      // Cross-language: look up API path
      const apiPath = apiPathMatch[1].replace(/\$\{[^}]+\}/g, "{id}").replace(/\?.*$/, "").replace(/^https?:\/\/[^/]+/, "");
      const routeMatches = routeIndex.get(apiPath) || [];
      matches = routeMatches.map(r => ({
        file: r.file, line: r.line, name: `${r.method} ${r.handler}`,
        type: r.type === "handler" ? "API Handler" : "API Caller",
      }));
    }

    // PSI reference resolution (scope-walking: import → file → project)
    if (matches.length === 0 && fileIndex && stubIndex) {
      const result = resolveReference(word, activeFile, clickedLine, fileIndex, stubIndex, importResolutionCache);
      if (result) {
        if (result.ambiguous) {
          matches = result.candidates.map(c => ({
            file: c.file, line: c.line, name: word,
            type: c.kind || c.signature || "symbol",
          }));
        } else {
          matches = [{ file: result.file, line: result.line, name: word, type: result.kind || "definition" }];
        }
      }
    }

    // Fallback: legacy symbol index (in case PSI indices aren't ready yet)
    if (matches.length === 0 && symbolIndex) {
      const symbolMatches = symbolIndex.get(word) || [];
      matches = symbolMatches.filter(s => !(s.file === activeFile && Math.abs(s.line - clickedLine) < 3));
    }

    if (matches.length === 0) return;

    if (matches.length === 1) {
      // Direct navigation with scroll-to-line
      const m = matches[0];
      setOpenFiles(prev => prev.includes(m.file) ? prev : [...prev, m.file]);
      setActiveFile(m.file);
      setPendingGoToLine(m.line);
      setDefPopup(null);
    } else {
      // Show popup with options
      const rect = editorRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      setDefPopup({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        matches,
      });
    }
  }, [fileIndex, stubIndex, importResolutionCache, symbolIndex, routeIndex, activeFile, setOpenFiles, setActiveFile, getLineAtClick]);

  // ── Save file (Cmd+S) ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeFile || !fileContents[activeFile]) return;
    const fc = fileContents[activeFile];
    if (!fc.modified) return;
    setSaving(true);
    try {
      await window.akatsuki.shinra.writeFile(activeFile, fc.content);
      setFileContents((prev) => ({
        ...prev,
        [activeFile]: {
          ...prev[activeFile],
          original: fc.content,
          modified: false,
        },
      }));
      // Trigger incremental re-index for this file
      if (invalidateFile) invalidateFile(activeFile);
    } catch {}
    setSaving(false);
  }, [activeFile, fileContents, invalidateFile]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape — close go-to-definition popup
      if (e.key === "Escape" && defPopup) {
        setDefPopup(null);
        return;
      }

      // ⌘S — save
      if (mod && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // ⌘W — close active tab
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeFile) handleCloseTab(activeFile);
        return;
      }

      // ⌘1-9 — switch to tab by index
      if (mod && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (openFiles[idx]) {
          e.preventDefault();
          setActiveFile(openFiles[idx]);
        }
        return;
      }

      // ⌘F — find in file
      if (mod && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        setFindOpen((p) => !p);
        setTimeout(() => findInputRef.current?.focus(), 50);
        return;
      }

      // Ctrl+` — toggle terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTermOpen((p) => !p);
        return;
      }

      // Cmd+Shift+P — cycle markdown preview mode
      if (mod && e.shiftKey && e.key === "p" && isMarkdown) {
        e.preventDefault();
        setMdPreviewMode(prev => prev === "code" ? "split" : prev === "split" ? "preview" : "code");
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleCloseTab, activeFile, openFiles, setActiveFile, isMarkdown, defPopup]);

  // ── File palette (⌘P): focus input when triggered ─────────────────────────
  const fileSearchRef = useRef(null);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [fileSearchOpen, setFileSearchOpen] = useState(false);

  useEffect(() => {
    if (filePaletteOpen) {
      setFileSearchOpen(true);
      setFilePaletteOpen(false);
      setTimeout(() => fileSearchRef.current?.focus(), 50);
    }
  }, [filePaletteOpen, setFilePaletteOpen]);

  // Flat list of all opened + recently seen files for palette
  const paletteFiles = useMemo(() => openFiles, [openFiles]);
  const filteredPalette = useMemo(() => {
    if (!fileSearchQuery.trim()) return paletteFiles;
    const q = fileSearchQuery.toLowerCase();
    return paletteFiles.filter((fp) => fp.toLowerCase().includes(q));
  }, [paletteFiles, fileSearchQuery]);

  // ── Scroll-to-line on cross-file navigation ────────────────────────────
  useEffect(() => {
    if (pendingGoToLine == null || !activeFile || !fileContents[activeFile]) return;
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const targetY = (pendingGoToLine - 1) * 20;
      const viewH = el.clientHeight;
      el.scrollTo({ top: Math.max(0, targetY - viewH / 2 + 10), behavior: "smooth" });
      setPendingGoToLine(null);
    });
  }, [pendingGoToLine, activeFile, fileContents]);

  // ── Track Cmd/Ctrl held for go-to-definition affordance ──────────────────
  useEffect(() => {
    const down = (e) => { if (e.metaKey || e.ctrlKey) setCmdHeld(true); };
    const up = (e) => { if (!e.metaKey && !e.ctrlKey) setCmdHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setCmdHeld(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── Track editor scroll for minimap ───────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onScroll = () => { setScrollTop(el.scrollTop); setDefPopup(null); };
    const onResize = () => setEditorHeight(el.clientHeight);
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);
    onResize();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [activeFile]);

  // ── Minimap seek (smooth) ─────────────────────────────────────────────────
  const handleMinimapSeek = useCallback((lineIdx) => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollTo({ top: lineIdx * 20, behavior: "smooth" });
  }, []);

  // ── Persistent shell session ──────────────────────────────────────────────
  const termScrollRef = useRef(null);
  const termInputRef = useRef(null);

  // Start shell when workingDir is available
  useEffect(() => {
    if (!workingDir) return;
    let mounted = true;

    (async () => {
      try {
        await window.akatsuki.shinra.shellDestroy();
        window.akatsuki.shinra.removeShellListeners();
      } catch {}

      window.akatsuki.shinra.onShellStdout((data) => {
        if (mounted) setTermOutput(prev => prev + data);
      });
      window.akatsuki.shinra.onShellStderr((data) => {
        if (mounted) setTermOutput(prev => prev + data);
      });
      window.akatsuki.shinra.onShellExit((code) => {
        if (mounted) {
          setTermOutput(prev => prev + `\n[Shell exited with code ${code}]\n`);
          setShellActive(false);
        }
      });

      try {
        const res = await window.akatsuki.shinra.shellCreate({ cwd: workingDir });
        if (mounted && res.ok) setShellActive(true);
      } catch {}
    })();

    return () => {
      mounted = false;
      try {
        window.akatsuki.shinra.removeShellListeners();
        window.akatsuki.shinra.shellDestroy();
      } catch {}
    };
  }, [workingDir]);

  // Auto-scroll terminal
  useEffect(() => {
    const el = termScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [termOutput, aiSuggestion]);

  // Terminal submit — send to persistent shell (or local echo if no shell)
  const handleTermSubmit = useCallback(async (e) => {
    e.preventDefault();
    const cmd = termInput.trim();
    if (!cmd) return;
    setTermInput("");
    setHistoryIdx(-1);
    setAiSuggestion(null);

    // Save to command history
    setCmdHistory(prev => {
      const next = [cmd, ...prev.filter(c => c !== cmd)].slice(0, 100);
      try { localStorage.setItem("shinra:cmd-history", JSON.stringify(next)); } catch {}
      return next;
    });

    if (shellActive) {
      // Write to shell stdin
      try {
        await window.akatsuki.shinra.shellWrite(cmd + "\n");
      } catch {
        setTermOutput(prev => prev + `[Error sending command]\n`);
      }
    } else {
      // Local echo mode when shell is not active
      setTermOutput(prev => prev + `$ ${cmd}\n[Shell not connected]\n`);
    }
  }, [termInput, shellActive]);

  // Up/Down arrow for command history
  const handleTermKeyDown = useCallback((e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistoryIdx(prev => {
        const next = Math.min(prev + 1, cmdHistory.length - 1);
        if (cmdHistory[next]) setTermInput(cmdHistory[next]);
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistoryIdx(prev => {
        const next = Math.max(prev - 1, -1);
        setTermInput(next < 0 ? "" : (cmdHistory[next] || ""));
        return next;
      });
    } else if (e.key === "c" && e.ctrlKey) {
      // Ctrl+C — send SIGINT
      window.akatsuki.shinra.shellWrite("\x03");
    }
  }, [cmdHistory]);

  // AI assist — ask AI about the command or error
  const handleAIAssist = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiSuggestion(null);

    // Get recent terminal output (last 2000 chars)
    const recentOutput = termOutput.slice(-2000);
    const currentCmd = termInput.trim();

    try {
      const cfg = await window.akatsuki.config.load();
      const agent = (cfg.aiAgents || []).find(a => a.apiKey);
      if (!agent) {
        setAiSuggestion({ text: "No AI agent configured. Go to Settings to add an API key.", cmd: null });
        setAiLoading(false);
        return;
      }

      const system = "You are a terminal assistant. Help the user with their terminal commands. Be concise. If suggesting a command, put it on its own line prefixed with $. Context: macOS zsh terminal.";
      const userMsg = currentCmd
        ? `I want to run: "${currentCmd}"\n\nRecent terminal output:\n${recentOutput}\n\nHelp me with this command. If it looks wrong, suggest the correct one.`
        : `Here's my recent terminal output:\n${recentOutput}\n\nWhat should I do next? If there's an error, help me fix it.`;

      const res = await window.akatsuki.ai.chat({
        provider: agent.provider,
        apiKey: agent.apiKey,
        model: agent.model,
        system,
        messages: [{ role: "user", content: userMsg }],
      });

      if (res.error) {
        setAiSuggestion({ text: `Error: ${res.error}`, cmd: null });
      } else {
        // Extract suggested command if any (lines starting with $)
        const lines = (res.text || "").split("\n");
        const cmdLine = lines.find(l => l.trim().startsWith("$ ") || l.trim().startsWith("$\t"));
        const suggestedCmd = cmdLine ? cmdLine.trim().replace(/^\$\s*/, "") : null;
        setAiSuggestion({ text: res.text, cmd: suggestedCmd });
      }
    } catch (e) {
      setAiSuggestion({ text: `Failed: ${e.message}`, cmd: null });
    }
    setAiLoading(false);
  }, [termOutput, termInput, aiLoading]);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeContent = activeFile && fileContents[activeFile] ? fileContents[activeFile].content : "";
  const activeModified = activeFile && fileContents[activeFile] ? fileContents[activeFile].modified : false;
  const lines = useMemo(() => activeContent.split("\n"), [activeContent]);
  const gutterWidth = useMemo(() => Math.max(String(lines.length).length * 9 + 16, 40), [lines.length]);
  const visibleLines = Math.floor(editorHeight / 20);
  const totalHeight = lines.length * 20;

  const termPanelHeight = termOpen ? 180 : 28;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* ── File Tree Sidebar ──────────────────────────────────────────── */}
      <div style={{
        width: 240,
        minWidth: 240,
        display: "flex",
        flexDirection: "column",
        background: T.bg0,
        borderRight: `1px solid ${T.border}`,
        overflow: "hidden",
      }}>
        <PanelHeader title="Explorer" accent={T.blue}>
          {workingDir && (
            <span
              onClick={handleOpenFolder}
              style={{ fontSize: 13, cursor: "pointer", color: T.txt3, lineHeight: 1 }}
              title="Open another folder"
            >
              +
            </span>
          )}
        </PanelHeader>

        {!workingDir ? (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>📂</div>
            <div style={{ fontSize: 12, color: T.txt3, textAlign: "center", lineHeight: 1.6 }}>
              No folder open
            </div>
            <Btn variant="primary" onClick={handleOpenFolder} style={{ marginTop: 4 }}>
              Open Folder
            </Btn>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: 4, paddingBottom: 8 }}>
            {/* Working dir label */}
            <div style={{
              padding: "4px 12px 6px",
              fontSize: 10,
              fontWeight: 700,
              color: T.txt3,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {basename(workingDir)}
            </div>

            {treeLoading ? (
              <div style={{ padding: "12px 16px", fontSize: 11, color: T.txt3 }}>Loading...</div>
            ) : treeEntries.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 11, color: T.txt3 }}>Empty directory</div>
            ) : (
              treeEntries.map((entry) => (
                <FileTreeItem
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  onFileClick={handleFileClick}
                  activeFile={activeFile}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Editor Area ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* ── Tab Bar ──────────────────────────────────────────────────── */}
        <div style={{
          height: 34,
          minHeight: 34,
          display: "flex",
          alignItems: "stretch",
          background: T.bg2,
          borderBottom: `1px solid ${T.border}`,
          overflowX: "auto",
          overflowY: "hidden",
        }}>
          {openFiles.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: T.txt3, fontFamily: T.fontUI }}>
              No files open
            </div>
          ) : (
            openFiles.map((fp) => (
              <EditorTab
                key={fp}
                filePath={fp}
                isActive={fp === activeFile}
                onSelect={() => setActiveFile(fp)}
                onClose={() => handleCloseTab(fp)}
                modified={fileContents[fp]?.modified || false}
              />
            ))
          )}
          <div style={{ flex: 1 }} />
          {/* Save indicator */}
          {saving && (
            <div style={{ display: "flex", alignItems: "center", padding: "0 10px", fontSize: 10, color: T.txt3 }}>
              Saving...
            </div>
          )}
        </div>

        {/* ── Editor + Minimap ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {!activeFile ? (
            // Empty state
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: T.bg0,
            }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>⌨</div>
              <div style={{ fontSize: 13, color: T.txt3, fontFamily: T.fontUI }}>
                {workingDir ? "Select a file to start editing" : "Open a folder to get started"}
              </div>
              <div style={{ fontSize: 11, color: T.txt3, opacity: 0.6, fontFamily: T.fontUI }}>
                Cmd+S to save
              </div>
            </div>
          ) : (
            <>
              {/* Code editor */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", background: T.bg0 }}>
                {/* Breadcrumb bar */}
                <div style={{
                  height: 28,
                  minHeight: 28,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 4,
                  background: T.bg1,
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 11,
                  fontFamily: T.fontUI,
                  color: T.txt3,
                  overflow: "hidden",
                }}>
                  {activeFile.replace(workingDir || "", "").split("/").filter(Boolean).map((part, i, arr) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={{ color: T.txt3, opacity: 0.4, margin: "0 2px", fontSize: 10 }}>{"\u203A"}</span>}
                      <span
                        style={{
                          color: i === arr.length - 1 ? T.txt : T.txt3,
                          cursor: "pointer",
                          transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.txt; }}
                        onMouseLeave={(e) => { if (i !== arr.length - 1) e.currentTarget.style.color = T.txt3; }}
                      >
                        {part}
                      </span>
                    </React.Fragment>
                  ))}
                  {isMarkdown && (
                    <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
                      {["code", "split", "preview"].map(mode => (
                        <button key={mode} onClick={() => setMdPreviewMode(mode)}
                          style={{
                            padding: "2px 8px", fontSize: 10, fontFamily: T.fontUI, fontWeight: 600,
                            border: `1px solid ${mdPreviewMode === mode ? T.blue : T.border}`,
                            background: mdPreviewMode === mode ? `${T.blue}20` : T.bg3,
                            color: mdPreviewMode === mode ? T.blue : T.txt2,
                            borderRadius: 4, cursor: "pointer", textTransform: "capitalize",
                          }}
                        >{mode === "code" ? "\u2328 Code" : mode === "split" ? "\u2AF8 Split" : "\uD83D\uDC41 Preview"}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  {activeModified && (
                    <Badge style={{ fontSize: 9, padding: "1px 6px" }}>Modified</Badge>
                  )}
                </div>

                {/* Find bar */}
                {findOpen && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 12px", background: T.bg1,
                    borderBottom: `1px solid ${T.border}`, height: 32, flexShrink: 0,
                  }}>
                    <input
                      ref={findInputRef}
                      value={findQuery}
                      onChange={(e) => {
                        const q = e.target.value;
                        setFindQuery(q);
                        if (q.length > 0) {
                          const count = (activeContent.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
                          setFindMatches(count);
                          setFindCurrent(count > 0 ? 1 : 0);
                        } else {
                          setFindMatches(0);
                          setFindCurrent(0);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
                        if (e.key === "Enter") setFindCurrent((p) => p < findMatches ? p + 1 : 1);
                      }}
                      placeholder="Find..."
                      style={{
                        flex: 1, maxWidth: 280, background: T.bg3, border: `1px solid ${T.border2}`,
                        borderRadius: 4, padding: "3px 8px", color: T.txt, fontSize: 12,
                        fontFamily: T.fontUI, outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, minWidth: 50 }}>
                      {findQuery ? `${findCurrent}/${findMatches}` : ""}
                    </span>
                    <span
                      onClick={() => { setFindOpen(false); setFindQuery(""); }}
                      style={{ color: T.txt3, cursor: "pointer", fontSize: 13 }}
                    >×</span>
                  </div>
                )}

                {/* Scrollable content area — code editor or markdown preview */}
                {isMarkdown && mdPreviewMode === "preview" ? (
                  <div style={{
                    position: "absolute",
                    top: findOpen ? 60 : 28,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflow: "auto",
                    background: T.bg0,
                  }}>
                    <MarkdownPreview content={activeContent} />
                  </div>
                ) : isMarkdown && mdPreviewMode === "split" ? (
                  <div style={{
                    position: "absolute",
                    top: findOpen ? 60 : 28,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    overflow: "hidden",
                  }}>
                    {/* Left: code editor */}
                    <div
                      ref={editorRef}
                      style={{ flex: 1, overflow: "auto", position: "relative" }}
                    >
                      <div style={{ position: "relative", minHeight: "100%", padding: "4px 0" }}>
                        {lines.map((line, i) => (
                          <CodeLine key={i} lineNum={i + 1} text={line} gutterWidth={gutterWidth} ext={activeExt} />
                        ))}
                      </div>
                      <textarea
                        value={activeContent}
                        onChange={handleContentChange}
                        onKeyDown={handleEditorKeyDown}
                        spellCheck={false}
                        style={{
                          position: "absolute", top: 0, left: gutterWidth, right: 0, bottom: 0,
                          width: `calc(100% - ${gutterWidth}px)`, minHeight: "100%",
                          padding: "4px 0", margin: 0, border: "none", outline: "none",
                          background: "transparent", color: "transparent", caretColor: T.txt,
                          fontSize: 13, fontFamily: T.fontMono, lineHeight: "20px", tabSize: 2,
                          whiteSpace: "pre", resize: "none", overflowX: "auto", overflowY: "hidden",
                          zIndex: 2, letterSpacing: "normal", wordSpacing: "normal",
                        }}
                      />
                    </div>
                    {/* Divider */}
                    <div style={{ width: 1, background: T.border, flexShrink: 0 }} />
                    {/* Right: preview */}
                    <div style={{ flex: 1, overflow: "auto", background: T.bg0 }}>
                      <MarkdownPreview content={activeContent} />
                    </div>
                  </div>
                ) : (
                  <div
                    ref={editorRef}
                    onClick={handleCodeClick}
                    style={{
                      position: "absolute",
                      top: findOpen ? 60 : 28,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      overflow: "auto",
                    }}
                  >
                    {/* Cmd+hover underline CSS (zero React re-renders) */}
                    {cmdHeld && (
                      <style>{`.shinra-token-id:hover { text-decoration: underline; cursor: pointer; color: ${T.blue} !important; }`}</style>
                    )}

                    {/* Highlighted display layer */}
                    <div style={{
                      position: "relative",
                      minHeight: "100%",
                      padding: "4px 0",
                    }}>
                      {lines.map((line, i) => (
                        <CodeLine
                          key={i}
                          lineNum={i + 1}
                          text={line}
                          gutterWidth={gutterWidth}
                          ext={activeExt}
                        />
                      ))}
                    </div>

                    {/* Transparent textarea overlay for editing */}
                    <textarea
                      value={activeContent}
                      onChange={handleContentChange}
                      onKeyDown={handleEditorKeyDown}
                      spellCheck={false}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: gutterWidth,
                        right: 0,
                        bottom: 0,
                        width: `calc(100% - ${gutterWidth}px)`,
                        minHeight: "100%",
                        padding: "4px 0",
                        margin: 0,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "transparent",
                        caretColor: T.txt,
                        fontSize: 13,
                        fontFamily: T.fontMono,
                        lineHeight: "20px",
                        tabSize: 2,
                        whiteSpace: "pre",
                        resize: "none",
                        overflowX: "auto",
                        overflowY: "hidden",
                        zIndex: 2,
                        letterSpacing: "normal",
                        wordSpacing: "normal",
                        pointerEvents: cmdHeld ? "none" : "auto",
                      }}
                    />

                    {/* Go-to-definition popup */}
                    {defPopup && (
                      <div style={{
                        position: "absolute",
                        left: defPopup.x,
                        top: defPopup.y,
                        zIndex: 100,
                        background: T.bg2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        padding: 4,
                        minWidth: 280,
                        maxHeight: 200,
                        overflowY: "auto",
                        fontFamily: T.fontUI,
                      }}>
                        <div style={{ padding: "4px 8px", fontSize: 10, color: T.txt3, borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                          Go to Definition — {defPopup.matches.length} match{defPopup.matches.length !== 1 ? "es" : ""}
                        </div>
                        {defPopup.matches.map((m, i) => (
                          <DefPopupItem key={i} m={m} onNavigate={(m) => {
                            setOpenFiles(prev => prev.includes(m.file) ? prev : [...prev, m.file]);
                            setActiveFile(m.file);
                            setPendingGoToLine(m.line);
                            setDefPopup(null);
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Minimap — hidden in full preview mode */}
              {!(isMarkdown && mdPreviewMode === "preview") && (
                <Minimap
                  lines={lines}
                  scrollTop={scrollTop}
                  visibleLines={visibleLines}
                  totalHeight={totalHeight}
                  onSeek={handleMinimapSeek}
                />
              )}
            </>
          )}
        </div>

        {/* ── Terminal Panel ────────────────────────────────────────────── */}
        <div style={{
          height: termPanelHeight,
          minHeight: termPanelHeight,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          borderTop: `1px solid ${T.border}`,
          transition: "height 0.15s ease",
        }}>
          {/* Terminal header */}
          <div
            onClick={() => setTermOpen((p) => !p)}
            style={{
              height: 28,
              minHeight: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              cursor: "pointer",
              userSelect: "none",
              background: T.bg2,
              borderBottom: termOpen ? `1px solid ${T.border}` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, background: T.green, borderRadius: 2 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.txt, fontFamily: T.fontUI, textTransform: "uppercase" }}>
                Terminal
              </span>
              {shellActive && (
                <span style={{ fontSize: 9, color: T.green, fontFamily: T.fontMono }}>zsh</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {termOpen && (
                <>
                  <span
                    onClick={(e) => { e.stopPropagation(); handleAIAssist(); }}
                    style={{
                      fontSize: 9, fontWeight: 700, color: aiLoading ? T.txt3 : T.purple,
                      cursor: "pointer", padding: "2px 8px", borderRadius: 4,
                      background: `${T.purple}14`, border: `1px solid ${T.purple}30`,
                      fontFamily: T.fontUI,
                    }}
                    title="Ask AI for help"
                  >
                    {aiLoading ? "Thinking..." : "AI Assist"}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setTermOutput(""); setAiSuggestion(null); }}
                    style={{ fontSize: 9, color: T.txt3, cursor: "pointer", padding: "2px 6px", fontFamily: T.fontUI }}
                    title="Clear terminal"
                  >
                    Clear
                  </span>
                </>
              )}
              <span style={{ fontSize: 12, color: T.txt3, transform: termOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                ▴
              </span>
            </div>
          </div>

          {termOpen && (
            <>
              {/* Terminal output — raw text like real terminal */}
              <div
                ref={termScrollRef}
                onClick={() => termInputRef.current?.focus()}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "6px 12px",
                  minHeight: 0,
                  fontSize: 12,
                  fontFamily: T.fontMono,
                  lineHeight: "18px",
                  color: "#ccc",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  cursor: "text",
                }}
              >
                {termOutput || (
                  <span style={{ color: T.txt3 }}>
                    {workingDir
                      ? "Starting shell..."
                      : "Open a folder to start the terminal. You can still type commands in echo mode."}
                  </span>
                )}

                {/* AI Suggestion */}
                {aiSuggestion && (
                  <AISuggestion
                    text={aiSuggestion.text}
                    onApply={aiSuggestion.cmd ? () => {
                      window.akatsuki.shinra.shellWrite(aiSuggestion.cmd + "\n");
                      setAiSuggestion(null);
                    } : null}
                    onDismiss={() => setAiSuggestion(null)}
                  />
                )}
              </div>

              {/* Terminal input */}
              <form
                onSubmit={handleTermSubmit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 12px",
                  height: 32,
                  minHeight: 32,
                  borderTop: `1px solid ${T.border}`,
                  background: "#111",
                }}
              >
                <span style={{ color: T.green, fontSize: 12, fontFamily: T.fontMono, flexShrink: 0 }}>❯</span>
                <input
                  ref={termInputRef}
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={handleTermKeyDown}
                  placeholder={shellActive ? "" : "Type a command..."}
                  autoFocus
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fff",
                    fontSize: 12,
                    fontFamily: T.fontMono,
                    padding: 0,
                  }}
                />
              </form>
            </>
          )}
        </div>
      </div>

      {/* ── ⌘P File Palette Overlay ──────────────────────────────────────── */}
      {fileSearchOpen && (
        <div
          onClick={() => setFileSearchOpen(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 100,
            background: "rgba(7,11,20,0.7)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: 80,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxHeight: 400,
              background: T.bg1, border: `1px solid ${T.border2}`,
              borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ padding: "0 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, height: 42 }}>
              <span style={{ color: T.txt3, fontSize: 13 }}>⌘P</span>
              <input
                ref={fileSearchRef}
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setFileSearchOpen(false); setFileSearchQuery(""); }
                  if (e.key === "Enter" && filteredPalette.length > 0) {
                    setActiveFile(filteredPalette[0]);
                    setFileSearchOpen(false); setFileSearchQuery("");
                  }
                }}
                placeholder="Search open files..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: T.txt, fontSize: 13, fontFamily: T.fontUI,
                }}
              />
              <span
                onClick={() => { setFileSearchOpen(false); setFileSearchQuery(""); }}
                style={{ color: T.txt3, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, background: T.bg3 }}
              >
                Esc
              </span>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredPalette.length === 0 ? (
                <div style={{ padding: "20px 16px", color: T.txt3, fontSize: 12, fontFamily: T.fontUI, textAlign: "center" }}>
                  {openFiles.length === 0 ? "No files open" : "No match"}
                </div>
              ) : (
                filteredPalette.map((fp) => {
                  const name = fp.split("/").pop();
                  const dir = fp.replace(workingDir || "", "");
                  const meta = getExtMeta(name);
                  return (
                    <div
                      key={fp}
                      onClick={() => { setActiveFile(fp); setFileSearchOpen(false); setFileSearchQuery(""); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "7px 16px",
                        cursor: "pointer", background: fp === activeFile ? `${T.blue}14` : "transparent",
                        borderLeft: fp === activeFile ? `2px solid ${T.blue}` : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => { if (fp !== activeFile) e.currentTarget.style.background = T.bg3; }}
                      onMouseLeave={(e) => { if (fp !== activeFile) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, fontFamily: T.fontMono, width: 20, textAlign: "center" }}>{meta.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.txt, fontFamily: T.fontUI }}>{name}</span>
                      <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dir}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScreenEditor;

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { T } from "../tokens";
import { PanelHeader, Btn } from "../components";
import { useKawaii } from "./KawaiiApp";
import { DB_TYPES } from "./mockData";
import { addAnalysisToHistory } from "./ScreenHistory";

// ── SQL Syntax Highlighter (shared) ─────────────────────────────────────────
export const SQL_KEYWORDS = new Set([
  "SELECT","FROM","WHERE","AND","OR","NOT","IN","ON","AS","JOIN","LEFT","RIGHT",
  "INNER","OUTER","CROSS","FULL","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET",
  "INSERT","INTO","UPDATE","SET","DELETE","CREATE","ALTER","DROP","TABLE","INDEX",
  "VIEW","TRIGGER","PROCEDURE","FUNCTION","IF","ELSE","THEN","END","CASE","WHEN",
  "EXISTS","BETWEEN","LIKE","IS","NULL","TRUE","FALSE","ASC","DESC","DISTINCT",
  "UNION","ALL","VALUES","DEFAULT","PRIMARY","KEY","FOREIGN","REFERENCES","CASCADE",
  "CONSTRAINT","UNIQUE","CHECK","COUNT","SUM","AVG","MIN","MAX","COALESCE",
  "CONCAT","CAST","CONVERT","DATE","NOW","REPLACE","SUBSTRING","TRIM","LENGTH",
]);

export const SQL_FUNCTIONS = new Set([
  "COUNT","SUM","AVG","MIN","MAX","COALESCE","CONCAT","CAST","CONVERT","DATE",
  "NOW","REPLACE","SUBSTRING","TRIM","LENGTH","UPPER","LOWER","ROUND","FLOOR",
  "CEIL","ABS","IFNULL","NULLIF","GROUP_CONCAT","ROW_NUMBER","RANK","DENSE_RANK",
]);

/**
 * Tokenizes a single line of SQL into an array of { text, color, bold? } objects.
 * Exported for use by ScreenQuery, ScreenNavigator, etc.
 */
export function highlightSQL(line) {
  const tokens = [];
  let i = 0;
  const src = line;

  while (i < src.length) {
    // Comments: -- ...
    if (src[i] === "-" && src[i + 1] === "-") {
      tokens.push({ text: src.slice(i), color: T.txt3 });
      i = src.length;
      continue;
    }

    // Strings: 'xxx'
    if (src[i] === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== "'") j++;
      j++; // include closing quote
      tokens.push({ text: src.slice(i, j), color: T.green });
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(src[i]) && (i === 0 || /[\s,=(><!]/.test(src[i - 1]))) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), color: T.amber });
      i = j;
      continue;
    }

    // Operators: >=, <=, !=, <>, =, >, <, +, -, *, /
    if (/[><=!+\-*/]/.test(src[i])) {
      let op = src[i];
      if (i + 1 < src.length && /[>=]/.test(src[i + 1]) && /[><!]/.test(src[i])) {
        op = src.slice(i, i + 2);
      }
      // Special: the lone * in "SELECT *"
      if (op === "*" && tokens.length > 0) {
        const prevText = tokens.map((t) => t.text).join("").trim().toUpperCase();
        if (prevText.endsWith("SELECT")) {
          tokens.push({ text: op, color: T.red, bold: true });
          i += op.length;
          continue;
        }
      }
      tokens.push({ text: op, color: T.txt2 });
      i += op.length;
      continue;
    }

    // Words (identifiers, keywords, functions)
    if (/[a-zA-Z_]/.test(src[i])) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();

      const isFunc = SQL_FUNCTIONS.has(upper) || (j < src.length && src[j] === "(");

      if (SQL_KEYWORDS.has(upper) && !isFunc) {
        tokens.push({ text: word, color: T.blue, bold: true });
      } else if (isFunc && SQL_FUNCTIONS.has(upper)) {
        tokens.push({ text: word, color: T.purple });
      } else {
        tokens.push({ text: word, color: T.teal });
      }
      i = j;
      continue;
    }

    // Dot operator for table.column
    if (src[i] === ".") {
      tokens.push({ text: ".", color: T.txt2 });
      i++;
      continue;
    }

    // Parentheses, commas, semicolons
    if (/[(),;]/.test(src[i])) {
      tokens.push({ text: src[i], color: T.txt2 });
      i++;
      continue;
    }

    // Whitespace and other
    tokens.push({ text: src[i], color: undefined });
    i++;
  }

  return tokens;
}

// ── SQL Analysis Engine (basic static analysis) ─────────────────────────────

function analyzeSQL(sql) {
  const upper = sql.toUpperCase();
  const issues = [];
  let score = 100;

  // Detect SELECT *
  if (/SELECT\s+\*/i.test(sql)) {
    issues.push({
      severity: "critical",
      title: "SELECT * Detected",
      desc: "SELECT * fetches all columns, increasing I/O and memory. Specify only the columns you need.",
      detail: "Replace SELECT * with explicit column names",
    });
    score -= 20;
  }

  // Detect correlated subquery in WHERE
  if (/WHERE[\s\S]*?\(\s*SELECT/i.test(sql)) {
    issues.push({
      severity: "critical",
      title: "Correlated Subquery in WHERE",
      desc: "A subquery inside WHERE may execute once per outer row. Consider rewriting as a JOIN.",
      detail: "Rewrite as JOIN for significant improvement",
    });
    score -= 25;
  }

  // Detect missing LIMIT
  const hasLimit = /\bLIMIT\b/i.test(sql);
  const isSelect = /^\s*SELECT\b/i.test(sql.trim());
  if (isSelect && !hasLimit) {
    issues.push({
      severity: "warning",
      title: "Missing LIMIT Clause",
      desc: "Query has no LIMIT. Large result sets may cause performance issues. Add LIMIT for pagination.",
      detail: "Add LIMIT to restrict returned rows",
    });
    score -= 10;
  }

  // Detect missing WHERE on UPDATE/DELETE
  if (/\b(UPDATE|DELETE)\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
    issues.push({
      severity: "critical",
      title: "Missing WHERE on UPDATE/DELETE",
      desc: "UPDATE or DELETE without WHERE affects all rows in the table. This is likely unintended.",
      detail: "Add WHERE clause to restrict affected rows",
    });
    score -= 30;
  }

  // Detect implicit joins (FROM a, b)
  const fromMatch = sql.match(/FROM\s+([^;]+?)(?:WHERE|ORDER|GROUP|HAVING|LIMIT|$)/is);
  if (fromMatch) {
    const fromClause = fromMatch[1];
    const commaCount = (fromClause.match(/,/g) || []).length;
    if (commaCount > 0 && !/\bJOIN\b/i.test(fromClause)) {
      issues.push({
        severity: "warning",
        title: "Implicit Join (Comma Syntax)",
        desc: "Using comma-separated tables in FROM can create cartesian products. Use explicit JOIN syntax.",
        detail: "Rewrite with explicit JOIN ... ON clauses",
      });
      score -= 15;
    }
  }

  // Detect ORDER BY without index hint
  if (/\bORDER\s+BY\b/i.test(sql) && !hasLimit) {
    issues.push({
      severity: "info",
      title: "ORDER BY Without LIMIT",
      desc: "Sorting all rows without LIMIT may cause a full filesort. Consider adding LIMIT or an appropriate index.",
      detail: "Add LIMIT or ensure an index covers the ORDER BY columns",
    });
    score -= 5;
  }

  // Detect LIKE with leading wildcard
  if (/LIKE\s+'%/i.test(sql)) {
    issues.push({
      severity: "warning",
      title: "Leading Wildcard in LIKE",
      desc: "LIKE '%...' prevents index usage and causes full table scans. Consider full-text search.",
      detail: "Avoid leading % in LIKE patterns for better performance",
    });
    score -= 10;
  }

  // Suggest index if WHERE clause references columns
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER|GROUP|HAVING|LIMIT|$)/i);
  if (whereMatch && issues.length > 0) {
    // Extract column references from WHERE
    const whereCols = [];
    const colRegex = /\b([a-z_][a-z0-9_.]*)\s*(?:=|>|<|>=|<=|!=|<>|LIKE|IN|BETWEEN)/gi;
    let m;
    while ((m = colRegex.exec(whereMatch[1])) !== null) {
      const col = m[1];
      const upperCol = col.toUpperCase();
      if (!SQL_KEYWORDS.has(upperCol) && !SQL_FUNCTIONS.has(upperCol)) {
        whereCols.push(col);
      }
    }
    if (whereCols.length > 0) {
      const uniqueCols = [...new Set(whereCols)];
      issues.push({
        severity: "info",
        title: "Index Suggestion",
        desc: `Consider adding an index on (${uniqueCols.join(", ")}) to speed up filtering.`,
        detail: `Est. improvement with proper indexing: significant`,
      });
      score -= 0; // info-only, no penalty
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { issues, score };
}

function extractTables(sql) {
  const tables = [];
  // Match FROM <table> and JOIN <table>
  const tableRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m;
  while ((m = tableRegex.exec(sql)) !== null) {
    const tbl = m[1].toLowerCase();
    if (!SQL_KEYWORDS.has(tbl.toUpperCase())) {
      tables.push(tbl);
    }
  }
  return [...new Set(tables)];
}

function generateExecutionPlan(sql) {
  const tables = extractTables(sql);
  if (tables.length === 0) return [];

  const upper = sql.toUpperCase();
  const hasSelectStar = /SELECT\s+\*/i.test(sql);
  const hasSubquery = /WHERE[\s\S]*?\(\s*SELECT/i.test(sql);

  return tables.map((table, idx) => {
    // First table in a non-optimized query is usually the worst
    let type = "ref";
    let typeColor = T.green;
    let key = `idx_${table}_id`;
    let extra = "Using index";

    if (idx === 0 && (hasSelectStar || hasSubquery)) {
      type = "ALL";
      typeColor = T.red;
      key = null;
      extra = "Using where" + (/\bORDER\s+BY\b/i.test(sql) ? "; filesort" : "");
    } else if (hasSubquery && idx > 0) {
      type = "ref";
      typeColor = T.amber;
      extra = "Using where";
    }

    return {
      table,
      type,
      typeColor,
      rows: type === "ALL" ? "~full" : "~est",
      key,
      extra,
    };
  });
}

function generateOptimizedSQL(sql) {
  let optimized = sql;

  // Replace SELECT * with specific columns
  const hasSelectStar = /SELECT\s+\*/i.test(sql);
  if (hasSelectStar) {
    // Try to extract table alias from FROM clause
    const aliasMatch = sql.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    const alias = aliasMatch ? aliasMatch[2] : null;
    const prefix = alias ? `${alias}.` : "";
    optimized = optimized.replace(
      /SELECT\s+\*/i,
      `SELECT\n  ${prefix}id, ${prefix}created_at, ${prefix}updated_at`
    );
    optimized = `-- Optimized: replaced SELECT * with specific columns\n${optimized}`;
  }

  // Replace correlated subquery with JOIN
  const subqueryMatch = optimized.match(
    /\bAND\s+\(\s*SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+WHERE\s+([a-zA-Z_.]+)\s*=\s*([a-zA-Z_.]+)\s*\)\s*>\s*(\d+)/is
  );
  if (subqueryMatch) {
    const [fullMatch, joinTable, joinAlias, joinCol, outerCol, threshold] = subqueryMatch;
    // Remove the subquery AND clause
    optimized = optimized.replace(fullMatch, "");
    // Find FROM ... and add JOIN after it
    const fromMatch = optimized.match(/(FROM\s+[a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*)/i);
    if (fromMatch) {
      optimized = optimized.replace(
        fromMatch[1],
        `${fromMatch[1]}\nINNER JOIN ${joinTable} ${joinAlias} ON ${joinCol} = ${outerCol}`
      );
    }
    // Add GROUP BY and HAVING before ORDER BY if present
    const orderMatch = optimized.match(/\bORDER\s+BY\b/i);
    if (orderMatch) {
      const insertPos = optimized.indexOf(orderMatch[0]);
      // Extract the alias used in SELECT
      const selectAlias = outerCol.split(".")[0];
      optimized =
        optimized.slice(0, insertPos) +
        `GROUP BY ${selectAlias}.id\nHAVING COUNT(${joinAlias}.id) > ${threshold}\n` +
        optimized.slice(insertPos);
    }
  }

  // Add LIMIT if missing
  if (!/\bLIMIT\b/i.test(optimized)) {
    // Remove trailing comments and whitespace, add LIMIT before them
    const trimmed = optimized.replace(/\s*$/, "");
    const lastSemicolon = trimmed.lastIndexOf(";");
    if (lastSemicolon >= 0) {
      optimized = trimmed.slice(0, lastSemicolon) + "\nLIMIT 100;";
    } else {
      optimized = trimmed + "\nLIMIT 100;";
    }
  }

  // Add index recommendation as comment
  const tables = extractTables(sql);
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER|GROUP|HAVING|LIMIT|$)/i);
  if (whereMatch && tables.length > 0) {
    const colRegex = /\b([a-z_][a-z0-9_]*)\s*(?:=|>|<|>=|<=|!=)/gi;
    const cols = [];
    let cm;
    while ((cm = colRegex.exec(whereMatch[1])) !== null) {
      const c = cm[1].toLowerCase();
      if (!SQL_KEYWORDS.has(c.toUpperCase())) cols.push(c);
    }
    if (cols.length > 0) {
      const uniqueCols = [...new Set(cols)];
      optimized += `\n\n-- Recommended index:\n-- CREATE INDEX idx_${tables[0]}_${uniqueCols.join("_")}\n--   ON ${tables[0]}(${uniqueCols.join(", ")});`;
    }
  }

  return optimized;
}

// ── Code Panel with line numbers ────────────────────────────────────────────
function CodePanel({ sql, highlightedLines = {}, style }) {
  const lines = sql.split("\n");

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        fontFamily: T.fontMono,
        fontSize: 11,
        lineHeight: "20px",
        ...style,
      }}
    >
      {lines.map((line, idx) => {
        const lineNum = idx + 1;
        const highlight = highlightedLines[lineNum];
        let bgColor = "transparent";
        if (highlight === "red") bgColor = `${T.red}08`;
        else if (highlight === "amber") bgColor = `${T.amber}08`;
        else if (highlight === "green") bgColor = `${T.green}08`;

        return (
          <CodeLine
            key={idx}
            line={line}
            lineNum={lineNum}
            bgColor={bgColor}
          />
        );
      })}
    </div>
  );
}

// ── Single code line (avoids hooks in .map()) ───────────────────────────────
function CodeLine({ line, lineNum, bgColor }) {
  const tokens = highlightSQL(line);
  return (
    <div
      style={{
        display: "flex",
        background: bgColor,
        minHeight: 20,
      }}
    >
      {/* Line number gutter */}
      <div
        style={{
          width: 32,
          minWidth: 32,
          textAlign: "right",
          paddingRight: 8,
          color: T.txt3,
          fontSize: 10,
          background: T.bg1,
          borderRight: `1px solid ${T.border}`,
          userSelect: "none",
          lineHeight: "20px",
        }}
      >
        {lineNum}
      </div>
      {/* Code content */}
      <div style={{ paddingLeft: 12, whiteSpace: "pre", flex: 1 }}>
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
      </div>
    </div>
  );
}

// ── Execution Plan Table ────────────────────────────────────────────────────
function ExecutionPlanTable({ plan }) {
  const headers = ["TABLE", "TYPE", "ROWS", "KEY", "EXTRA"];

  if (!plan || plan.length === 0) {
    return (
      <div
        style={{
          padding: "16px 14px",
          color: T.txt3,
          fontSize: 11,
          fontFamily: T.fontUI,
          textAlign: "center",
        }}
      >
        Run analysis to see execution plan
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: T.fontMono,
          fontSize: 10,
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "6px 10px",
                  color: T.txt3,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  borderBottom: `1px solid ${T.border}`,
                  background: T.bg1,
                  fontFamily: T.fontUI,
                  textTransform: "uppercase",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.map((row, idx) => (
            <ExecutionPlanRow key={idx} row={row} idx={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Execution Plan Row (named component, no hooks in .map()) ────────────────
function ExecutionPlanRow({ row, idx }) {
  return (
    <tr
      style={{
        background: idx % 2 === 0 ? T.bg0 : `${T.bg1}60`,
      }}
    >
      <td
        style={{
          padding: "5px 10px",
          color: T.txt,
          fontWeight: 600,
        }}
      >
        {row.table}
      </td>
      <td style={{ padding: "5px 10px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "1px 8px",
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            background: `${row.typeColor}18`,
            border: `1px solid ${row.typeColor}40`,
            color: row.typeColor,
            fontFamily: T.fontMono,
          }}
        >
          {row.type}
        </span>
      </td>
      <td style={{ padding: "5px 10px", color: T.txt2 }}>
        {row.rows}
      </td>
      <td
        style={{
          padding: "5px 10px",
          color: row.key ? T.txt2 : T.txt3,
          fontStyle: row.key ? "normal" : "italic",
        }}
      >
        {row.key ?? "NULL"}
      </td>
      <td style={{ padding: "5px 10px", color: T.txt2, fontSize: 10 }}>
        {row.extra}
      </td>
    </tr>
  );
}

// ── Performance Score Gauge ─────────────────────────────────────────────────
function PerformanceGauge({ score }) {
  const radius = 44;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const size = (radius + stroke) * 2;

  let scoreColor = T.red;
  let label = "Poor Performance";
  if (score >= 80) {
    scoreColor = T.green;
    label = "Good Performance";
  } else if (score >= 50) {
    scoreColor = T.amber;
    label = "Fair Performance";
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0 12px",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Background ring */}
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke={T.bg3}
          strokeWidth={stroke}
        />
        {/* Score ring */}
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Centered text overlay */}
      <div
        style={{
          marginTop: -size / 2 - 18,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: size,
          justifyContent: "center",
          transform: "translateY(-2px)",
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: scoreColor,
            fontFamily: T.fontUI,
            lineHeight: 1,
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: 11,
            color: T.txt3,
            fontFamily: T.fontUI,
            marginTop: 2,
          }}
        >
          /100
        </span>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: scoreColor,
          fontFamily: T.fontUI,
          marginTop: 8,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Issue Card ──────────────────────────────────────────────────────────────
function IssueCard({ issue }) {
  const severityMap = {
    critical: { color: T.red, label: "Critical" },
    warning: { color: T.amber, label: "Warning" },
    info: { color: T.blue, label: "Suggest" },
  };
  const sev = severityMap[issue.severity] || severityMap.info;

  // Determine if detail line should be green (positive improvement)
  const isPositive =
    issue.detail.includes("improvement") || issue.detail.includes("faster");

  return (
    <div
      style={{
        width: 410,
        borderRadius: 6,
        background: T.bg0,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
        display: "flex",
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          width: 3,
          minWidth: 3,
          background: sev.color,
          flexShrink: 0,
        }}
      />
      {/* Content */}
      <div style={{ flex: 1, padding: "8px 10px", position: "relative" }}>
        {/* Severity badge */}
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 4,
            background: `${sev.color}18`,
            border: `1px solid ${sev.color}40`,
            color: sev.color,
            fontFamily: T.fontUI,
            textTransform: "capitalize",
          }}
        >
          {sev.label}
        </span>
        {/* Title */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.txt,
            fontFamily: T.fontUI,
            marginBottom: 3,
            paddingRight: 70,
          }}
        >
          {issue.title}
        </div>
        {/* Description */}
        <div
          style={{
            fontSize: 10,
            color: T.txt2,
            fontFamily: T.fontUI,
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {issue.desc}
        </div>
        {/* Detail line */}
        <div
          style={{
            fontSize: 9,
            color: isPositive ? T.green : T.txt3,
            fontFamily: T.fontMono,
          }}
        >
          {issue.detail}
        </div>
      </div>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        gap: 8,
      }}
    >
      <span style={{ fontSize: 28, opacity: 0.5 }}>{icon}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: T.txt2,
          fontFamily: T.fontUI,
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 11,
          color: T.txt3,
          fontFamily: T.fontUI,
          textAlign: "center",
          maxWidth: 260,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </span>
    </div>
  );
}

// ── Compute line highlights from issues ─────────────────────────────────────
function computeHighlights(sql, issues) {
  const lines = sql.split("\n");
  const highlights = {};
  const upper = sql.toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase().trim();
    const lineNum = i + 1;

    // Highlight SELECT * lines as red
    if (/SELECT\s+\*/.test(lineUpper)) {
      highlights[lineNum] = "red";
      continue;
    }

    // Highlight correlated subquery lines as red
    if (/^\s*\(\s*$/.test(lines[i]) || /^\s*SELECT\s+COUNT/i.test(lines[i]) ||
        (/^\s*FROM\s/i.test(lines[i]) && /WHERE[\s\S]*\(\s*SELECT/i.test(upper)) ||
        /^\s*WHERE\s.*=.*\.\s*id/i.test(lines[i]) || /^\s*\)\s*>\s*\d+/.test(lines[i])) {
      // Check if this line is inside a subquery context
      const beforeThis = lines.slice(0, i + 1).join("\n").toUpperCase();
      if (/\(\s*SELECT/.test(beforeThis) && (beforeThis.match(/\(/g) || []).length > (beforeThis.match(/\)/g) || []).length) {
        highlights[lineNum] = "red";
        continue;
      }
    }

    // Highlight comment lines as amber
    if (lineUpper.startsWith("--")) {
      highlights[lineNum] = "amber";
      continue;
    }
  }

  return highlights;
}

// ── Main Screen ─────────────────────────────────────────────────────────────
function ScreenAIAnalyze() {
  const { activeConnection, setActiveTab, setSqlTabs, activeSqlTab, aiAnalyzeInitialSQL, setAiAnalyzeInitialSQL } = useKawaii();

  const [inputSQL, setInputSQL] = useState("");
  const [analysis, setAnalysis] = useState(null); // { issues, score }
  const [optimizedSQL, setOptimizedSQL] = useState("");
  const [executionPlan, setExecutionPlan] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Consume initial SQL from History (cross-screen navigation)
  useEffect(() => {
    if (aiAnalyzeInitialSQL) {
      setInputSQL(aiAnalyzeInitialSQL);
      setAiAnalyzeInitialSQL(null);
    }
  }, [aiAnalyzeInitialSQL, setAiAnalyzeInitialSQL]);

  const handleAnalyze = useCallback(async () => {
    const trimmed = inputSQL.trim();
    if (!trimmed) return;

    setIsAnalyzing(true);

    // Local static analysis (always works, even offline)
    const result = analyzeSQL(trimmed);
    setAnalysis(result);
    setOptimizedSQL(generateOptimizedSQL(trimmed));

    // Try to get real execution plan via IPC
    if (activeConnection) {
      try {
        const explainResult = await window.akatsuki.kawaiidb.explainQuery({
          connectionId: activeConnection.id,
          sql: trimmed,
        });
        if (explainResult.plan && explainResult.plan.length > 0) {
          setExecutionPlan(explainResult.plan);
        } else {
          setExecutionPlan(generateExecutionPlan(trimmed));
        }
      } catch {
        setExecutionPlan(generateExecutionPlan(trimmed));
      }
    } else {
      setExecutionPlan(generateExecutionPlan(trimmed));
    }

    // Auto-save to history
    try {
      const { issues, score } = result;
      addAnalysisToHistory({
        title: issues[0]?.title || "SQL Analysis",
        sql: trimmed,
        aiSummary: `Found ${issues.length} issues, score: ${score}/100`,
        connectionId: activeConnection?.id,
        connectionName: activeConnection?.name,
        connectionColor: activeConnection?.type ? (DB_TYPES[activeConnection.type]?.color || "#3DEFE9") : "#3DEFE9",
        dbType: activeConnection?.version || (activeConnection?.type ? DB_TYPES[activeConnection.type]?.label : "Unknown"),
        database: activeConnection?.database,
        score,
        issues: {
          critical: issues.filter((i) => i.severity === "critical").length,
          warning: issues.filter((i) => i.severity === "warning").length,
          info: issues.filter((i) => i.severity === "info" || i.severity === "suggest").length,
        },
        improvement: Math.min(99, Math.max(10, 100 - score)),
      });
    } catch {}

    setIsAnalyzing(false);
  }, [inputSQL, activeConnection]);

  const handleCopy = useCallback(() => {
    if (!optimizedSQL) return;
    navigator.clipboard.writeText(optimizedSQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [optimizedSQL]);

  const handleApply = useCallback(() => {
    if (!optimizedSQL) return;
    // Set the optimized SQL into the active query tab and navigate to Query screen
    setSqlTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeSqlTab ? { ...tab, content: optimizedSQL } : tab
      )
    );
    setActiveTab("query");
  }, [optimizedSQL, setSqlTabs, activeSqlTab, setActiveTab]);

  // Compute line highlights for input SQL
  const inputHighlights = useMemo(() => {
    if (!analysis || !inputSQL.trim()) return {};
    return computeHighlights(inputSQL, analysis.issues);
  }, [inputSQL, analysis]);

  // All lines of optimized SQL highlighted green
  const optimizedHighlights = useMemo(() => {
    if (!optimizedSQL) return {};
    const lines = optimizedSQL.split("\n");
    const h = {};
    lines.forEach((_, idx) => {
      h[idx + 1] = "green";
    });
    return h;
  }, [optimizedSQL]);

  // Estimated impact stats
  const impactStats = useMemo(() => {
    if (!analysis) return null;
    const { issues, score } = analysis;
    const critCount = issues.filter((i) => i.severity === "critical").length;
    const warnCount = issues.filter((i) => i.severity === "warning").length;

    // Estimate improvement based on score
    const improvementPct = Math.min(99, Math.max(10, 100 - score));
    const tablesFound = extractTables(inputSQL);
    const tableCount = tablesFound.length || 1;

    return {
      speedup: `~${improvementPct}% faster`,
      reduction: `${tableCount} table${tableCount !== 1 ? "s" : ""} optimized`,
    };
  }, [analysis, inputSQL]);

  // ── No connection state ───────────────────────────────────────────────────
  if (!activeConnection) {
    return (
      <div
        className="screen-enter"
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <EmptyState
          icon={"\u26A0"}
          title="No Active Connection"
          subtitle="Select a connection from the dropdown above to start analyzing queries."
        />
      </div>
    );
  }

  return (
    <div
      className="screen-enter"
      style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* ── LEFT PANEL: Original Query ─────────────────────────────────── */}
      <div
        style={{
          width: 480,
          minWidth: 480,
          display: "flex",
          flexDirection: "column",
          background: T.bg0,
          borderRight: `1px solid ${T.border}`,
        }}
      >
        {/* Panel header */}
        <PanelHeader title="Original Query" accent={T.purple}>
          <Btn
            onClick={handleAnalyze}
            disabled={!inputSQL.trim() || isAnalyzing}
            style={{
              height: 24,
              fontSize: 10,
              padding: "0 10px",
              background: T.purple,
              color: T.bg0,
              border: "none",
              fontWeight: 700,
              borderRadius: 5,
            }}
          >
            {isAnalyzing ? "Analyzing..." : "\u2726 Analyze"}
          </Btn>
        </PanelHeader>

        {/* SQL input textarea */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Highlighted overlay */}
          {inputSQL.trim() && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "auto",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              <CodePanel
                sql={inputSQL}
                highlightedLines={inputHighlights}
                style={{ background: "transparent" }}
              />
            </div>
          )}
          {/* Editable textarea */}
          <textarea
            value={inputSQL}
            onChange={(e) => setInputSQL(e.target.value)}
            placeholder="Paste or type your SQL query here..."
            spellCheck={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              background: inputSQL.trim() ? "transparent" : T.bg0,
              color: "transparent",
              caretColor: T.txt,
              fontFamily: T.fontMono,
              fontSize: 11,
              lineHeight: "20px",
              padding: "0 0 0 44px",
              border: "none",
              borderRadius: 0,
              resize: "none",
              outline: "none",
              zIndex: 2,
            }}
          />
          {/* Empty state placeholder */}
          {!inputSQL.trim() && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 0,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: T.txt3,
                  fontFamily: T.fontUI,
                }}
              >
                Paste a SQL query and click Analyze
              </span>
            </div>
          )}
        </div>

        {/* Execution Plan */}
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
        >
          <PanelHeader title="Execution Plan" accent={T.amber} />
          <ExecutionPlanTable plan={executionPlan} />
        </div>
      </div>

      {/* ── CENTER PANEL: AI Analysis ──────────────────────────────────── */}
      <div
        style={{
          width: 440,
          minWidth: 440,
          display: "flex",
          flexDirection: "column",
          background: T.bg1,
          borderRight: `1px solid ${T.border}`,
          overflow: "hidden",
        }}
      >
        {/* Panel header */}
        <PanelHeader title="AI Analysis" accent={T.purple}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 10,
              fontWeight: 600,
              background: `${T.purple}18`,
              border: `1px solid ${T.purple}40`,
              color: T.purple,
              fontFamily: T.fontUI,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: T.purple,
                flexShrink: 0,
              }}
            />
            Claude
          </span>
        </PanelHeader>

        <div style={{ flex: 1, overflow: "auto", padding: "0 14px" }}>
          {!analysis ? (
            <EmptyState
              icon={"\u2726"}
              title="Ready to Analyze"
              subtitle="Paste a SQL query in the left panel and click Analyze to get AI-powered performance insights."
            />
          ) : (
            <>
              {/* Performance Score Gauge */}
              <PerformanceGauge score={analysis.score} />

              {/* Issues Found */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "12px 0 8px",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    color: T.txt,
                    fontFamily: T.fontUI,
                    textTransform: "uppercase",
                  }}
                >
                  Issues Found
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 9,
                    background: `${T.red}18`,
                    border: `1px solid ${T.red}40`,
                    color: T.red,
                    fontFamily: T.fontUI,
                  }}
                >
                  {analysis.issues.length}
                </span>
              </div>

              {/* Issue cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.issues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} />
                ))}
              </div>

              {analysis.issues.length === 0 && (
                <div
                  style={{
                    padding: "20px 0",
                    textAlign: "center",
                    color: T.green,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: T.fontUI,
                  }}
                >
                  No issues detected. Query looks good!
                </div>
              )}

              {/* Estimated Impact */}
              {impactStats && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.8,
                      color: T.txt,
                      fontFamily: T.fontUI,
                      textTransform: "uppercase",
                      margin: "16px 0 8px",
                    }}
                  >
                    Estimated Impact
                  </div>
                  <div style={{ display: "flex", gap: 8, paddingBottom: 16 }}>
                    <div
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 6,
                        background: T.bg0,
                        border: `1px solid ${T.green}30`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: T.green,
                          fontFamily: T.fontUI,
                          lineHeight: 1.3,
                        }}
                      >
                        {impactStats.speedup}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: T.txt3,
                          fontFamily: T.fontUI,
                          marginTop: 2,
                        }}
                      >
                        execution time
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 6,
                        background: T.bg0,
                        border: `1px solid ${T.green}30`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: T.green,
                          fontFamily: T.fontUI,
                          lineHeight: 1.3,
                        }}
                      >
                        {impactStats.reduction}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: T.txt3,
                          fontFamily: T.fontUI,
                          marginTop: 2,
                        }}
                      >
                        scope of changes
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Optimized Query ───────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: T.bg0,
        }}
      >
        {/* Panel header */}
        <PanelHeader title="Optimized Query" accent={T.green}>
          <Btn
            onClick={handleApply}
            disabled={!optimizedSQL}
            style={{
              height: 24,
              fontSize: 10,
              padding: "0 10px",
              background: optimizedSQL ? T.teal : T.bg3,
              color: optimizedSQL ? T.bg0 : T.txt3,
              border: "none",
              fontWeight: 700,
              borderRadius: 5,
            }}
          >
            Apply
          </Btn>
          <Btn
            variant="ghost"
            onClick={handleCopy}
            disabled={!optimizedSQL}
            style={{ height: 24, fontSize: 10, padding: "0 10px" }}
          >
            {copied ? "Copied!" : "Copy"}
          </Btn>
        </PanelHeader>

        {/* Optimized SQL code or empty state */}
        {optimizedSQL ? (
          <CodePanel sql={optimizedSQL} highlightedLines={optimizedHighlights} />
        ) : (
          <EmptyState
            icon={"\u2728"}
            title="Optimized Query"
            subtitle="Run analysis to see optimization suggestions here."
          />
        )}
      </div>
    </div>
  );
}

export default ScreenAIAnalyze;

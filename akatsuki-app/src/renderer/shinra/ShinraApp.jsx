import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { T } from "../tokens";
import useRepositoryIndex from "./useRepositoryIndex";

// ── localStorage persistence helpers ─────────────────────────────────────────
const LS_PREFIX = "shinra:";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveJSON(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
}

// ── Lazy screen imports ──────────────────────────────────────────────────────
const ScreenEditor = lazy(() => import("./ScreenEditor"));
const ScreenDebugger = lazy(() => import("./ScreenDebugger"));
const ScreenAIAssistant = lazy(() => import("./ScreenAIAssistant"));
const ScreenDiagram = lazy(() => import("./ScreenDiagram"));
const ScreenPlugins = lazy(() => import("./ScreenPlugins"));
const ScreenSearch = lazy(() => import("./ScreenSearch"));
const ScreenRunConfig = lazy(() => import("./ScreenRunConfig"));
const ScreenCallGraph = lazy(() => import("./ScreenCallGraph"));

// ── Context ──────────────────────────────────────────────────────────────────
const ShinraContext = React.createContext();
export const useShinra = () => React.useContext(ShinraContext);

// ── Loading fallback ─────────────────────────────────────────────────────────
function ScreenLoader() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T.fontUI,
        color: T.txt3,
        fontSize: 13,
      }}
    >
      Loading...
    </div>
  );
}

// ── TypeScript / JS syntax highlighter ───────────────────────────────────────
const TS_KEYWORDS = new Set([
  "import","export","from","const","let","var","function","return","if","else",
  "for","while","do","switch","case","break","continue","new","delete","typeof",
  "instanceof","in","of","class","extends","implements","interface","type","enum",
  "async","await","try","catch","finally","throw","yield","this","super","static",
  "public","private","protected","readonly","abstract","declare","module","namespace",
  "require","default","as","true","false","null","undefined","void","never",
]);

const TS_TYPES = new Set([
  "string","number","boolean","any","unknown","object","symbol","bigint",
  "Array","Promise","Map","Set","Record","Partial","Required","Omit","Pick",
  "Request","Response","NextFunction","Date","Error","RegExp",
]);

export function highlightTS(line) {
  const tokens = [];
  let i = 0;
  const src = line;

  while (i < src.length) {
    // Comments: // ...
    if (src[i] === "/" && src[i + 1] === "/") {
      tokens.push({ text: src.slice(i), color: T.txt3 });
      i = src.length;
      continue;
    }

    // Strings: 'xxx' or "xxx" or `xxx`
    if (src[i] === "'" || src[i] === '"' || src[i] === "`") {
      const q = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\") j++;
        j++;
      }
      j++;
      tokens.push({ text: src.slice(i, j), color: T.green });
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(src[i]) && (i === 0 || /[\s,=(><!;:[\]{}+\-*/]/.test(src[i - 1]))) {
      let j = i;
      while (j < src.length && /[\d.xXa-fA-F_n]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), color: T.amber });
      i = j;
      continue;
    }

    // Operators
    if (/[><=!+\-*/%&|^~?]/.test(src[i])) {
      let op = src[i];
      if (i + 1 < src.length && /[>=&|=]/.test(src[i + 1])) {
        op = src.slice(i, i + 2);
        if (i + 2 < src.length && src[i + 2] === "=") op = src.slice(i, i + 3);
      }
      tokens.push({ text: op, color: T.txt2 });
      i += op.length;
      continue;
    }

    // Words
    if (/[a-zA-Z_$]/.test(src[i])) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);

      if (TS_KEYWORDS.has(word)) {
        tokens.push({ text: word, color: T.purple, bold: true });
      } else if (TS_TYPES.has(word)) {
        tokens.push({ text: word, color: T.cyan });
      } else if (j < src.length && src[j] === "(") {
        tokens.push({ text: word, color: T.blue });
      } else {
        tokens.push({ text: word, color: T.txt });
      }
      i = j;
      continue;
    }

    // Decorators @
    if (src[i] === "@") {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), color: T.amber });
      i = j;
      continue;
    }

    // Brackets, parens, etc
    if (/[(){}[\],;:.]/.test(src[i])) {
      tokens.push({ text: src[i], color: T.txt2 });
      i++;
      continue;
    }

    tokens.push({ text: src[i], color: undefined });
    i++;
  }

  return tokens;
}

// ── Multi-language syntax highlighting ────────────────────────────────────────

// Markdown
export function highlightMD(line) {
  // Headings
  const headingMatch = line.match(/^(#{1,6})\s/);
  if (headingMatch) {
    return [
      { text: headingMatch[1] + " ", color: T.purple, bold: true },
      { text: line.slice(headingMatch[0].length), color: T.txt, bold: true },
    ];
  }
  // Code blocks
  if (line.startsWith("```")) return [{ text: line, color: T.green }];
  // Blockquotes
  if (line.startsWith("> ")) return [{ text: "> ", color: T.txt3 }, { text: line.slice(2), color: T.txt2 }];
  // Lists
  if (/^(\s*[-*+]\s)/.test(line)) {
    const m = line.match(/^(\s*[-*+]\s)/);
    return [{ text: m[1], color: T.amber }, { text: line.slice(m[1].length), color: T.txt }];
  }
  // Numbered lists
  if (/^(\s*\d+\.\s)/.test(line)) {
    const m = line.match(/^(\s*\d+\.\s)/);
    return [{ text: m[1], color: T.amber }, { text: line.slice(m[1].length), color: T.txt }];
  }
  // Horizontal rules
  if (/^[-*_]{3,}\s*$/.test(line)) return [{ text: line, color: T.txt3 }];
  // Inline: bold, italic, code, links
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > i) { tokens.push({ text: line.slice(i, end + 1), color: T.green }); i = end + 1; continue; }
    }
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end > i) { tokens.push({ text: line.slice(i, end + 2), color: T.txt, bold: true }); i = end + 2; continue; }
    }
    if (line[i] === "[") {
      const close = line.indexOf("](", i);
      if (close > i) {
        const pEnd = line.indexOf(")", close);
        if (pEnd > close) { tokens.push({ text: line.slice(i, pEnd + 1), color: T.blue }); i = pEnd + 1; continue; }
      }
    }
    tokens.push({ text: line[i], color: T.txt });
    i++;
  }
  return tokens;
}

// JSON
export function highlightJSON(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') { if (line[j] === "\\") j++; j++; }
      j++;
      const str = line.slice(i, j);
      // Check if it's a key (followed by :)
      const rest = line.slice(j).trimStart();
      tokens.push({ text: str, color: rest.startsWith(":") ? T.cyan : T.green });
      i = j; continue;
    }
    if (/\d/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\d.eE+\-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber });
      i = j; continue;
    }
    if (line.slice(i, i + 4) === "true" || line.slice(i, i + 5) === "false") {
      const w = line.slice(i, i + 4) === "true" ? "true" : "false";
      tokens.push({ text: w, color: T.purple, bold: true });
      i += w.length; continue;
    }
    if (line.slice(i, i + 4) === "null") {
      tokens.push({ text: "null", color: T.purple, bold: true });
      i += 4; continue;
    }
    tokens.push({ text: line[i], color: /[{}[\]:,]/.test(line[i]) ? T.txt2 : undefined });
    i++;
  }
  return tokens;
}

// YAML
export function highlightYAML(line) {
  if (/^\s*#/.test(line)) return [{ text: line, color: T.txt3 }];
  if (line.trim() === "---" || line.trim() === "...") return [{ text: line, color: T.purple }];
  const kvMatch = line.match(/^(\s*)([\w.\-/]+)(\s*:\s*)(.*)/);
  if (kvMatch) {
    const tokens = [];
    if (kvMatch[1]) tokens.push({ text: kvMatch[1], color: undefined });
    tokens.push({ text: kvMatch[2], color: T.cyan });
    tokens.push({ text: kvMatch[3], color: T.txt2 });
    const val = kvMatch[4];
    if (/^['"]/.test(val)) tokens.push({ text: val, color: T.green });
    else if (/^(true|false|yes|no|on|off)$/i.test(val.trim())) tokens.push({ text: val, color: T.purple, bold: true });
    else if (/^\d/.test(val.trim())) tokens.push({ text: val, color: T.amber });
    else tokens.push({ text: val, color: T.txt });
    return tokens;
  }
  if (/^\s*-\s/.test(line)) {
    const m = line.match(/^(\s*-\s)(.*)/);
    return [{ text: m[1], color: T.amber }, { text: m[2], color: T.txt }];
  }
  return [{ text: line, color: T.txt }];
}

// CSS / SCSS
export function highlightCSS(line) {
  if (/^\s*\/\//.test(line) || /^\s*\/\*/.test(line) || /^\s*\*/.test(line))
    return [{ text: line, color: T.txt3 }];
  // Property: value
  const propMatch = line.match(/^(\s*)([\w-]+)(\s*:\s*)(.*)/);
  if (propMatch) {
    const tokens = [{ text: propMatch[1], color: undefined }];
    tokens.push({ text: propMatch[2], color: T.cyan });
    tokens.push({ text: propMatch[3], color: T.txt2 });
    tokens.push({ text: propMatch[4], color: T.amber });
    return tokens;
  }
  // Selectors
  if (/[.#@&]/.test(line.trim()[0]) || /\{|\}/.test(line)) return [{ text: line, color: T.purple }];
  return [{ text: line, color: T.txt }];
}

// Python
const PY_KEYWORDS = new Set([
  "import","from","def","class","return","if","elif","else","for","while","with","as",
  "try","except","finally","raise","yield","lambda","pass","break","continue","and","or",
  "not","is","in","True","False","None","self","async","await","global","nonlocal","del",
  "assert","print",
]);
export function highlightPython(line) {
  if (/^\s*#/.test(line)) return [{ text: line, color: T.txt3 }];
  if (/^\s*("""|\'\'\')/.test(line)) return [{ text: line, color: T.green }];
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "#") { tokens.push({ text: line.slice(i), color: T.txt3 }); break; }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]; let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === "\\") j++; j++; }
      j++;
      tokens.push({ text: line.slice(i, j), color: T.green }); i = j; continue;
    }
    if (/\d/.test(line[i]) && (i === 0 || /[\s,=([\]{:+\-*/]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d._xXoObB]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (PY_KEYWORDS.has(w)) tokens.push({ text: w, color: T.purple, bold: true });
      else if (w[0] === w[0].toUpperCase() && /[a-z]/.test(w)) tokens.push({ text: w, color: T.cyan });
      else if (j < line.length && line[j] === "(") tokens.push({ text: w, color: T.blue });
      else tokens.push({ text: w, color: T.txt });
      i = j; continue;
    }
    if (line[i] === "@") {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9_.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber }); i = j; continue;
    }
    tokens.push({ text: line[i], color: /[><=!+\-*/%&|^~]/.test(line[i]) ? T.txt2 : undefined });
    i++;
  }
  return tokens;
}

// Go
const GO_KEYWORDS = new Set([
  "package","import","func","return","if","else","for","range","switch","case","default",
  "break","continue","go","defer","select","chan","type","struct","interface","map","var",
  "const","true","false","nil","make","append","len","cap","new","delete","panic","recover",
]);
export function highlightGo(line) {
  if (/^\s*\/\//.test(line)) return [{ text: line, color: T.txt3 }];
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"' || line[i] === "`") {
      const q = line[i]; let j = i + 1;
      while (j < line.length && line[j] !== q) { if (q === '"' && line[j] === "\\") j++; j++; }
      j++;
      tokens.push({ text: line.slice(i, j), color: T.green }); i = j; continue;
    }
    if (/\d/.test(line[i]) && (i === 0 || /[\s,=([\]{:+\-*/]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d.xXoO_]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (GO_KEYWORDS.has(w)) tokens.push({ text: w, color: T.purple, bold: true });
      else if (w[0] === w[0].toUpperCase()) tokens.push({ text: w, color: T.cyan });
      else if (j < line.length && line[j] === "(") tokens.push({ text: w, color: T.blue });
      else tokens.push({ text: w, color: T.txt });
      i = j; continue;
    }
    tokens.push({ text: line[i], color: /[><=!+\-*/%&|^~:]/.test(line[i]) ? T.txt2 : undefined });
    i++;
  }
  return tokens;
}

// Rust
const RS_KEYWORDS = new Set([
  "use","mod","fn","let","mut","const","pub","struct","enum","impl","trait","where","match",
  "if","else","for","while","loop","return","break","continue","as","in","ref","self","Self",
  "super","crate","async","await","move","dyn","type","unsafe","extern","true","false",
  "Some","None","Ok","Err","Box","Vec","String","Option","Result","println","eprintln","macro_rules",
]);
export function highlightRust(line) {
  if (/^\s*\/\//.test(line)) return [{ text: line, color: T.txt3 }];
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') { if (line[j] === "\\") j++; j++; }
      j++;
      tokens.push({ text: line.slice(i, j), color: T.green }); i = j; continue;
    }
    if (/\d/.test(line[i]) && (i === 0 || /[\s,=([\]{:+\-*/]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d._xXoObBuif]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (RS_KEYWORDS.has(w)) tokens.push({ text: w, color: T.purple, bold: true });
      else if (w[0] === w[0].toUpperCase()) tokens.push({ text: w, color: T.cyan });
      else if (j < line.length && (line[j] === "(" || line[j] === "!")) tokens.push({ text: w, color: T.blue });
      else tokens.push({ text: w, color: T.txt });
      i = j; continue;
    }
    if (line[i] === "#" && line[i + 1] === "[") {
      const end = line.indexOf("]", i);
      if (end > i) { tokens.push({ text: line.slice(i, end + 1), color: T.amber }); i = end + 1; continue; }
    }
    tokens.push({ text: line[i], color: /[><=!+\-*/%&|^~?:]/.test(line[i]) ? T.txt2 : undefined });
    i++;
  }
  return tokens;
}

// Shell
export function highlightShell(line) {
  if (/^\s*#/.test(line)) return [{ text: line, color: T.txt3 }];
  const SHELL_KW = new Set(["if","then","else","elif","fi","for","while","do","done","case","esac","in","function","return","exit","echo","export","source","set","unset","local","readonly","cd","pwd","ls","cat","grep","sed","awk","find","mkdir","rm","cp","mv","chmod","chown","curl","wget","git","docker","npm","yarn","node","python"]);
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]; let j = i + 1;
      while (j < line.length && line[j] !== q) { if (q === '"' && line[j] === "\\") j++; j++; }
      j++;
      tokens.push({ text: line.slice(i, j), color: T.green }); i = j; continue;
    }
    if (line[i] === "$") {
      let j = i + 1;
      if (line[j] === "{") { const end = line.indexOf("}", j); if (end > j) { tokens.push({ text: line.slice(i, end + 1), color: T.cyan }); i = end + 1; continue; } }
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.cyan }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_\-]/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (SHELL_KW.has(w)) tokens.push({ text: w, color: T.purple, bold: true });
      else if (w.startsWith("-")) tokens.push({ text: w, color: T.amber });
      else tokens.push({ text: w, color: T.txt });
      i = j; continue;
    }
    if (line[i] === "-") {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9\-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: T.amber }); i = j; continue;
    }
    tokens.push({ text: line[i], color: /[|>&;()]/.test(line[i]) ? T.txt2 : undefined });
    i++;
  }
  return tokens;
}

// HTML
export function highlightHTML(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line.slice(i, i + 4) === "<!--") {
      const end = line.indexOf("-->", i + 4);
      if (end > i) { tokens.push({ text: line.slice(i, end + 3), color: T.txt3 }); i = end + 3; continue; }
      tokens.push({ text: line.slice(i), color: T.txt3 }); break;
    }
    if (line[i] === "<") {
      let j = i + 1;
      if (line[j] === "/") j++;
      let tag = "";
      while (j < line.length && /[a-zA-Z0-9\-]/.test(line[j])) { tag += line[j]; j++; }
      if (tag) {
        tokens.push({ text: line.slice(i, i + (line[i + 1] === "/" ? 2 : 1)), color: T.txt2 });
        tokens.push({ text: tag, color: T.red });
        i = j;
        // Attributes
        while (i < line.length && line[i] !== ">") {
          if (/\s/.test(line[i])) { tokens.push({ text: line[i], color: undefined }); i++; continue; }
          if (line[i] === '"' || line[i] === "'") {
            const q = line[i]; let k = i + 1;
            while (k < line.length && line[k] !== q) k++;
            k++;
            tokens.push({ text: line.slice(i, k), color: T.green }); i = k; continue;
          }
          if (line[i] === "=" || line[i] === "/") { tokens.push({ text: line[i], color: T.txt2 }); i++; continue; }
          let k = i;
          while (k < line.length && /[a-zA-Z0-9\-:]/.test(line[k])) k++;
          if (k > i) { tokens.push({ text: line.slice(i, k), color: T.amber }); i = k; continue; }
          tokens.push({ text: line[i], color: T.txt2 }); i++;
        }
        if (i < line.length && line[i] === ">") { tokens.push({ text: ">", color: T.txt2 }); i++; }
        continue;
      }
    }
    tokens.push({ text: line[i], color: T.txt }); i++;
  }
  return tokens;
}

// Dispatcher: pick highlighter by file extension
const EXT_HIGHLIGHTER = {
  js: highlightTS, jsx: highlightTS, ts: highlightTS, tsx: highlightTS, mjs: highlightTS, cjs: highlightTS,
  json: highlightJSON, md: highlightMD,
  yml: highlightYAML, yaml: highlightYAML, toml: highlightYAML,
  css: highlightCSS, scss: highlightCSS,
  py: highlightPython,
  go: highlightGo,
  rs: highlightRust,
  sh: highlightShell, bash: highlightShell, zsh: highlightShell,
  html: highlightHTML, htm: highlightHTML, xml: highlightHTML, svg: highlightHTML,
};

export function highlightLine(line, ext) {
  const fn = EXT_HIGHLIGHTER[ext];
  return fn ? fn(line) : highlightTS(line);
}

// ── Main ShinraApp component ─────────────────────────────────────────────────
function ShinraApp({ initialTab, onNavigate }) {
  // Tab state — driven by parent sidebar
  const [activeTab, setActiveTabRaw] = useState(initialTab || "editor");

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabRaw(initialTab);
    }
  }, [initialTab]);

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    if (onNavigate) onNavigate(`shinra:${tab}`);
  }, [onNavigate]);

  // Working directory
  const [workingDir, setWorkingDir] = useState(() => loadJSON("workdir", null));
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    saveJSON("workdir", workingDir);
  }, [workingDir]);

  // Open files / tabs
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);

  // Plugins
  const [plugins, setPlugins] = useState(() => loadJSON("plugins", [
    { id: "typescript", name: "TypeScript", abbr: "TS", version: "5.4.2", author: "Shinra Tensei", color: T.blue, category: "Language", installed: true, enabled: true, rating: 4.9, downloads: "2.1M", description: "Full TypeScript & JavaScript language support with IntelliSense" },
    { id: "python", name: "Python", abbr: "Py", version: "3.8.1", author: "Shinra Tensei", color: T.green, category: "Language", installed: true, enabled: true, rating: 4.8, downloads: "1.8M", description: "Python language support with debugging, linting, and venv" },
    { id: "rust", name: "Rust Analyzer", abbr: "Rs", version: "0.4.1", author: "rust-lang", color: T.red, category: "Language", installed: false, enabled: false, rating: 4.7, downloads: "890K", description: "Rust language support with real-time diagnostics and cargo integration" },
    { id: "go", name: "Go", abbr: "Go", version: "0.41.2", author: "golang", color: T.cyan, category: "Language", installed: false, enabled: false, rating: 4.8, downloads: "1.2M", description: "Rich Go language support including IntelliSense, debugging, and testing" },
    { id: "docker", name: "Docker", abbr: "\uD83D\uDC33", version: "1.28.0", author: "Microsoft", color: T.blue, category: "Tools", installed: true, enabled: true, rating: 4.6, downloads: "3.2M", description: "Build, manage and deploy containerized applications" },
    { id: "ai-code-lens", name: "AI Code Lens", abbr: "\u2726", version: "2.1.0", author: "Shinra Tensei", color: T.purple, category: "AI", installed: true, enabled: true, rating: 4.9, downloads: "1.5M", description: "AI-powered code suggestions, explanations, and refactoring" },
  ]));

  useEffect(() => {
    saveJSON("plugins", plugins);
  }, [plugins]);

  // Run configurations
  const [runConfigs, setRunConfigs] = useState(() => loadJSON("run-configs", []));
  useEffect(() => { saveJSON("run-configs", runConfigs); }, [runConfigs]);
  const [activeConfig, setActiveConfig] = useState(null);

  // Debug state
  const [debugSession, setDebugSession] = useState(null);

  // Search state (shared for Search Everywhere overlay)
  const [searchOpen, setSearchOpen] = useState(false);

  // File palette open (Cmd+P)
  const [filePaletteOpen, setFilePaletteOpen] = useState(false);

  // AI chat history
  const [aiHistory, setAiHistory] = useState(() => loadJSON("ai-history", []));
  useEffect(() => {
    saveJSON("ai-history", aiHistory.slice(-100));
  }, [aiHistory]);

  // ── Repository Index (shared by Dependency Graph + Call Graph) ───────────
  const index = useRepositoryIndex(workingDir);

  // File watcher: auto-invalidate on external file changes
  useEffect(() => {
    if (!workingDir) return;
    window.akatsuki.shinra.watchStart({
      dir: workingDir,
      extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "go", "rs"],
    });
    const handler = (data) => {
      if (data && data.paths) index.invalidateFiles(data.paths);
    };
    window.akatsuki.shinra.onFsChanged(handler);
    return () => {
      window.akatsuki.shinra.watchStop();
      window.akatsuki.shinra.removeFsListeners();
    };
  }, [workingDir, index.invalidateFiles]);

  // ── App-wide keyboard shortcuts ──────────────────────────────────────────
  const lastShiftRef = useRef(0);
  useEffect(() => {
    const handler = (e) => {
      // ⇧⇧ double-shift → Search Everywhere
      if (e.key === "Shift" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        if (now - lastShiftRef.current < 400) {
          e.preventDefault();
          setActiveTab("search");
          setSearchOpen(true);
          lastShiftRef.current = 0;
        } else {
          lastShiftRef.current = now;
        }
        return;
      }

      // ⌘P → open file palette in editor
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setActiveTab("editor");
        setFilePaletteOpen(true);
        return;
      }

      // ⌘⇧D → debugger
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "d") {
        e.preventDefault();
        setActiveTab("debugger");
        return;
      }

      // ⌘⇧X → plugins
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "x") {
        e.preventDefault();
        setActiveTab("plugins");
        return;
      }

      // ⌘, → run config / settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setActiveTab("config");
        return;
      }

      // Escape → close search if open
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setActiveTab("editor");
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveTab, searchOpen]);

  // Context value
  const ctxValue = useMemo(
    () => ({
      activeTab, setActiveTab,
      workingDir, setWorkingDir,
      openFiles, setOpenFiles,
      activeFile, setActiveFile,
      plugins, setPlugins,
      runConfigs, setRunConfigs,
      activeConfig, setActiveConfig,
      debugSession, setDebugSession,
      searchOpen, setSearchOpen,
      filePaletteOpen, setFilePaletteOpen,
      aiHistory, setAiHistory,
      // Repository index (shared by Dependency Graph + Call Graph)
      indexStatus: index.status,
      indexProgress: index.progress,
      indexError: index.error,
      repoType: index.repoType,
      indexFileList: index.fileList,
      indexFileSet: index.fileSet,
      importGraph: index.importGraph,
      functionMap: index.functionMap,
      fullScan: index.fullScan,
      invalidateFile: index.invalidateFile,
      invalidateFiles: index.invalidateFiles,
    }),
    [
      activeTab, setActiveTab,
      workingDir,
      openFiles, activeFile,
      plugins,
      runConfigs, activeConfig,
      debugSession,
      searchOpen,
      filePaletteOpen,
      aiHistory,
      index.status, index.progress, index.error, index.repoType,
      index.fileList, index.fileSet, index.importGraph, index.functionMap,
      index.fullScan, index.invalidateFile, index.invalidateFiles,
    ]
  );

  // Status bar text
  const statusText = useMemo(() => {
    switch (activeTab) {
      case "editor": {
        if (!activeFile) return workingDir ? `${workingDir}` : "No folder open";
        const ext = activeFile.includes(".") ? activeFile.split(".").pop().toLowerCase() : "";
        const langMap = {
          ts: "TypeScript", tsx: "TypeScript JSX", js: "JavaScript", jsx: "JavaScript JSX",
          py: "Python", go: "Go", rs: "Rust", json: "JSON", md: "Markdown",
          css: "CSS", scss: "CSS", html: "HTML", xml: "XML", svg: "SVG",
          yml: "YAML", yaml: "YAML", toml: "TOML", sh: "Shell", bash: "Shell",
          env: "Environment", gitignore: "Git Ignore", lock: "Lock File",
        };
        const lang = langMap[ext] || "Plain Text";
        return `${activeFile} | ${lang} | UTF-8 | LF`;
      }
      case "debugger":
        return debugSession ? `Debug Mode | ${debugSession.name}` : "No debug session";
      case "ai":
        return `AI Assistant | Claude Sonnet 4`;
      case "diagram":
        return index.status === "scanning"
          ? `Indexing... ${index.progress.scanned}/${index.progress.total} files`
          : `Dependency Graph | ${index.fileList.length} files indexed`;
      case "plugins":
        return `${plugins.filter(p => p.installed).length} installed | ${plugins.filter(p => !p.installed).length} available`;
      case "search":
        return "Search Everywhere";
      case "config":
        return `${runConfigs.length} configuration${runConfigs.length !== 1 ? "s" : ""}`;
      case "callgraph":
        return index.status === "scanning"
          ? `Indexing... ${index.progress.scanned}/${index.progress.total} files`
          : `Function Call Graph | ${index.functionMap ? index.functionMap.size : 0} functions`;
      default:
        return "Shinra Tensei IDE";
    }
  }, [activeTab, activeFile, workingDir, debugSession, plugins, runConfigs]);

  // Render active screen
  const renderScreen = () => {
    switch (activeTab) {
      case "editor": return <ScreenEditor />;
      case "debugger": return <ScreenDebugger />;
      case "ai": return <ScreenAIAssistant />;
      case "diagram": return <ScreenDiagram />;
      case "plugins": return <ScreenPlugins />;
      case "search": return <ScreenSearch />;
      case "config": return <ScreenRunConfig />;
      case "callgraph": return <ScreenCallGraph />;
      default: return null;
    }
  };

  return (
    <ShinraContext.Provider value={ctxValue}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          background: T.bg0,
          fontFamily: T.fontUI,
          color: T.txt,
          overflow: "hidden",
        }}
      >
        {/* ── Main content area ───────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Suspense fallback={<ScreenLoader />}>{renderScreen()}</Suspense>
        </main>

        {/* ── Status bar ──────────────────────────────────────────────── */}
        <footer
          style={{
            height: 20,
            minHeight: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: T.bg2,
            borderTop: `1px solid ${T.border}`,
            padding: "0 12px",
            fontFamily: T.fontUI,
            fontSize: 10,
            color: T.txt2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: debugSession ? T.amber : T.green,
                flexShrink: 0,
              }}
            />
            <span>{statusText}</span>
          </div>
          <span>Shinra Tensei v1.0</span>
        </footer>
      </div>
    </ShinraContext.Provider>
  );
}

export default ShinraApp;
export { ShinraContext };

// ── Shared repository index parsers ──────────────────────────────────────────
// Extracted from ScreenDiagram.jsx and ScreenCallGraph.jsx into a shared module
// used by useRepositoryIndex.js for unified, real-time indexing.

// ── Constants ────────────────────────────────────────────────────────────────
export const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  "__pycache__", ".cache", ".turbo", "venv", ".venv", "target", "vendor",
]);

export const DEPENDENCY_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "go", "rs", "dart",
  "swift", "kt", "sql",
]);

export const CALLGRAPH_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "go", "dart", "swift", "kt",
]);

// Extensions that should go through PSI parsing (superset of CALLGRAPH)
export const PSI_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "go", "dart",
  "py", "swift", "kt", "sql",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

export function extOf(name) {
  const m = name.match(/\.[^.]+$/);
  return m ? m[0] : "";
}

export function extRaw(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

// ── Import extraction (JS/TS, Python, Go, Rust) ─────────────────────────────

export function extractImports(source, filePath) {
  const paths = [];
  const ext = extOf(filePath || "");
  let m;

  if (ext === ".py") {
    const fromRe = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm;
    while ((m = fromRe.exec(source)) !== null) paths.push(m[1]);
    const impRe = /^\s*import\s+([a-zA-Z0-9_.]+)/gm;
    while ((m = impRe.exec(source)) !== null) paths.push(m[1]);
  } else if (ext === ".go") {
    const singleRe = /^\s*import\s+"([^"]+)"/gm;
    while ((m = singleRe.exec(source)) !== null) paths.push(m[1]);
    const blockRe = /import\s*\(([\s\S]*?)\)/g;
    while ((m = blockRe.exec(source)) !== null) {
      const block = m[1];
      const lineRe = /\s*(?:\w+\s+)?"([^"]+)"/g;
      let lm;
      while ((lm = lineRe.exec(block)) !== null) paths.push(lm[1]);
    }
  } else if (ext === ".rs") {
    const useRe = /^\s*use\s+([a-zA-Z0-9_:]+)/gm;
    while ((m = useRe.exec(source)) !== null) paths.push(m[1].split("::").slice(0, 2).join("::"));
    const modRe = /^\s*mod\s+([a-zA-Z0-9_]+)\s*;/gm;
    while ((m = modRe.exec(source)) !== null) paths.push(m[1]);
  } else if (ext === ".dart") {
    const dartImport = /^\s*import\s+['"]([^'"]+)['"]/gm;
    while ((m = dartImport.exec(source)) !== null) paths.push(m[1]);
    const dartExport = /^\s*export\s+['"]([^'"]+)['"]/gm;
    while ((m = dartExport.exec(source)) !== null) paths.push(m[1]);
  } else {
    const importRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    while ((m = importRe.exec(source)) !== null) paths.push(m[1]);
    const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = reqRe.exec(source)) !== null) paths.push(m[1]);
    const exportRe = /export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    while ((m = exportRe.exec(source)) !== null) paths.push(m[1]);
  }
  return paths;
}

// ── Import path resolution ───────────────────────────────────────────────────

export function resolveImportPath(importPath, currentFile, fileSet, workDir) {
  const ext = extOf(currentFile);

  // Python
  if (ext === ".py") {
    if (importPath.startsWith(".")) {
      const dir = currentFile.substring(0, currentFile.lastIndexOf("/"));
      const dots = importPath.match(/^\.+/)[0].length;
      let base = dir;
      for (let i = 1; i < dots; i++) base = base.substring(0, base.lastIndexOf("/"));
      const rest = importPath.replace(/^\.+/, "").replace(/\./g, "/");
      const candidate = base + (rest ? "/" + rest : "");
      if (fileSet.has(candidate + ".py")) return candidate + ".py";
      if (fileSet.has(candidate + "/__init__.py")) return candidate + "/__init__.py";
      return null;
    }
    if (workDir) {
      const modPath = workDir + "/" + importPath.replace(/\./g, "/");
      if (fileSet.has(modPath + ".py")) return modPath + ".py";
      if (fileSet.has(modPath + "/__init__.py")) return modPath + "/__init__.py";
    }
    return null;
  }

  // Go
  if (ext === ".go") {
    for (const fp of fileSet) {
      const fpDir = fp.substring(0, fp.lastIndexOf("/"));
      if (fpDir.endsWith(importPath) || fpDir.endsWith("/" + importPath.split("/").pop())) return fp;
    }
    return null;
  }

  // Rust
  if (ext === ".rs") {
    const dir = currentFile.substring(0, currentFile.lastIndexOf("/"));
    const modName = importPath.replace(/::/g, "/").replace(/^crate/, "").replace(/^self/, "");
    if (fileSet.has(dir + "/" + modName + ".rs")) return dir + "/" + modName + ".rs";
    if (fileSet.has(dir + "/" + modName + "/mod.rs")) return dir + "/" + modName + "/mod.rs";
    if (workDir) {
      const fromRoot = workDir + "/src" + (modName.startsWith("/") ? modName : "/" + modName);
      if (fileSet.has(fromRoot + ".rs")) return fromRoot + ".rs";
      if (fileSet.has(fromRoot + "/mod.rs")) return fromRoot + "/mod.rs";
    }
    return null;
  }

  // Dart
  if (ext === ".dart") {
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      const dir = currentFile.substring(0, currentFile.lastIndexOf("/"));
      const parts = (dir + "/" + importPath).split("/");
      const resolved = [];
      for (const p of parts) {
        if (p === "" || p === ".") continue;
        if (p === "..") { resolved.pop(); continue; }
        resolved.push(p);
      }
      const base = "/" + resolved.join("/");
      if (fileSet.has(base)) return base;
      if (fileSet.has(base + ".dart")) return base + ".dart";
      return null;
    }
    if (importPath.startsWith("package:")) {
      const tail = importPath.replace(/^package:[^/]+\//, "");
      for (const fp of fileSet) {
        if (fp.endsWith("/" + tail) || fp.endsWith("/" + tail + ".dart")) return fp;
      }
      return null;
    }
    return null;
  }

  // JS/TS: skip bare specifiers
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) return null;

  const dir = currentFile.substring(0, currentFile.lastIndexOf("/"));
  const parts = (importPath.startsWith("/") ? importPath : dir + "/" + importPath).split("/");
  const resolved = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  const base = "/" + resolved.join("/");

  if (fileSet.has(base)) return base;
  for (const jsExt of [".ts", ".tsx", ".js", ".jsx"]) {
    if (fileSet.has(base + jsExt)) return base + jsExt;
  }
  for (const jsExt of ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) {
    if (fileSet.has(base + jsExt)) return base + jsExt;
  }
  return null;
}

// ── Function parsing ─────────────────────────────────────────────────────────

export function parseFile(content, filePath) {
  // Dispatch to language-specific parser based on file extension
  if (filePath.endsWith(".go")) return parseFileGo(content, filePath);
  if (filePath.endsWith(".dart")) return parseFileDart(content, filePath);
  return parseFileJS(content, filePath);
}

// ── JS/TS parser ─────────────────────────────────────────────────────────────

function parseFileJS(content, filePath) {
  const lines = content.split("\n");
  const functions = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    let match = null;
    let fnName = null;
    let isExported = false;
    let isAsync = false;
    let params = [];

    // export async function name(...)
    match = trimmed.match(/^(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/);
    if (match) {
      isExported = !!match[1]; isAsync = !!match[2]; fnName = match[3]; params = parseParams(match[4]);
    }

    // export const name = (async)? (...) =>
    if (!fnName) {
      match = trimmed.match(/^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/);
      if (match) {
        isExported = !!match[1]; isAsync = !!match[4]; fnName = match[3]; params = parseParams(match[5]);
      }
    }

    // export const name = (async)? function(...)
    if (!fnName) {
      match = trimmed.match(/^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/);
      if (match) {
        isExported = !!match[1]; isAsync = !!match[4]; fnName = match[3]; params = parseParams(match[5]);
      }
    }

    // Class method: name(...) {
    if (!fnName) {
      match = trimmed.match(/^(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "import", "export"].includes(match[2])) {
        isAsync = !!match[1]; fnName = match[2]; params = parseParams(match[3]);
      }
    }

    if (!fnName) continue;

    // Track braces for body extraction
    const startLine = i;
    let braceCount = 0;
    let bodyStarted = false;
    let endLine = i;

    for (let j = i; j < lines.length; j++) {
      const l = lines[j];
      for (let k = 0; k < l.length; k++) {
        if (l[k] === "{") { braceCount++; bodyStarted = true; }
        else if (l[k] === "}") { braceCount--; }
      }
      if (bodyStarted && braceCount <= 0) { endLine = j; break; }
      if (j === lines.length - 1) endLine = j;
    }

    const body = lines.slice(startLine, endLine + 1).join("\n");
    const calls = extractCalls(body, fnName);
    const returnType = inferReturnType(body, isAsync);

    let fnType = "internal";
    if (isExported) fnType = "export";
    else if (isAsync) fnType = "async";
    else if (fnName.startsWith("on") || fnName.startsWith("handle") || params.some(p => p.name === "cb" || p.name === "callback" || p.name === "handler")) fnType = "callback";

    functions.push({
      name: fnName, file: filePath,
      startLine: startLine + 1, endLine: endLine + 1,
      params, returnType, type: fnType,
      isAsync, isExported, calls, body,
    });
  }

  return functions;
}

// ── Go parser ────────────────────────────────────────────────────────────────

function parseGoParams(paramStr) {
  if (!paramStr || !paramStr.trim()) return [];
  return paramStr.split(",").map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return null;
    // "name Type" or just "Type"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return { name: parts[0], type: parts.slice(1).join(" ") };
    }
    return { name: parts[0], type: "any" };
  }).filter(Boolean);
}

function parseFileGo(content, filePath) {
  const lines = content.split("\n");
  const functions = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//")) continue;

    let fnName = null;
    let params = [];
    let returnType = "void";
    let isExported = false;
    let isMethod = false;

    // func (r *Type) MethodName(params) returnType {
    let match = trimmed.match(/^func\s+\([^)]*\)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(.*)/);
    if (match) {
      fnName = match[1];
      params = parseGoParams(match[2]);
      isMethod = true;
      const rest = match[3];
      // Extract return type: "(Type, error) {" or "Type {"
      const multiReturn = rest.match(/^\(([^)]+)\)\s*\{/);
      if (multiReturn) returnType = "(" + multiReturn[1] + ")";
      else {
        const singleReturn = rest.match(/^([a-zA-Z_*[\]{}.<>]+)\s*\{/);
        if (singleReturn) returnType = singleReturn[1];
      }
    }

    // func FuncName(params) returnType {
    if (!fnName) {
      match = trimmed.match(/^func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(.*)/);
      if (match) {
        fnName = match[1];
        params = parseGoParams(match[2]);
        const rest = match[3];
        const multiReturn = rest.match(/^\(([^)]+)\)\s*\{/);
        if (multiReturn) returnType = "(" + multiReturn[1] + ")";
        else {
          const singleReturn = rest.match(/^([a-zA-Z_*[\]{}.<>]+)\s*\{/);
          if (singleReturn) returnType = singleReturn[1];
        }
      }
    }

    // type TypeName struct {
    if (!fnName) {
      match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+struct\s*\{/);
      if (match) {
        fnName = match[1];
        params = [];
        returnType = "struct";
      }
    }

    // type TypeName interface {
    if (!fnName) {
      match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+interface\s*\{/);
      if (match) {
        fnName = match[1];
        params = [];
        returnType = "interface";
      }
    }

    if (!fnName) continue;

    isExported = /^[A-Z]/.test(fnName);

    // Track braces for body extraction
    const startLine = i;
    let braceCount = 0;
    let bodyStarted = false;
    let endLine = i;

    for (let j = i; j < lines.length; j++) {
      const l = lines[j];
      for (let k = 0; k < l.length; k++) {
        if (l[k] === "{") { braceCount++; bodyStarted = true; }
        else if (l[k] === "}") { braceCount--; }
      }
      if (bodyStarted && braceCount <= 0) { endLine = j; break; }
      if (j === lines.length - 1) endLine = j;
    }

    const body = lines.slice(startLine, endLine + 1).join("\n");
    const calls = extractCalls(body, fnName);
    const isAsync = /\bgo\s+/.test(body);

    let fnType = isExported ? "export" : "internal";

    functions.push({
      name: fnName, file: filePath,
      startLine: startLine + 1, endLine: endLine + 1,
      params, returnType, type: fnType,
      isAsync, isExported, calls, body,
    });
  }

  return functions;
}

// ── Dart parser ──────────────────────────────────────────────────────────────

function parseDartParams(paramStr) {
  if (!paramStr || !paramStr.trim()) return [];
  // Strip outer braces for named params: {required Type name, Type name2}
  let str = paramStr.trim();
  if (str.startsWith("{")) str = str.slice(1);
  if (str.endsWith("}")) str = str.slice(0, -1);
  if (str.startsWith("[")) str = str.slice(1);
  if (str.endsWith("]")) str = str.slice(0, -1);

  return str.split(",").map((p) => {
    let trimmed = p.trim();
    if (!trimmed) return null;
    // Remove "required" keyword
    trimmed = trimmed.replace(/^required\s+/, "");
    // "Type name" or "Type? name" or "Type name = default"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      // Last token is the name, everything before is the type
      const name = parts[parts.length - 1].replace(/=.*$/, "").trim();
      const type = parts.slice(0, parts.length - 1).join(" ");
      return { name, type };
    }
    return { name: parts[0], type: "dynamic" };
  }).filter(Boolean);
}

function parseFileDart(content, filePath) {
  const lines = content.split("\n");
  const functions = [];
  let inClass = false;
  let classDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    let fnName = null;
    let params = [];
    let returnType = "void";
    let isExported = false;
    let isAsync = false;
    let isStatic = false;
    let isOverride = false;

    // Check for @override on previous line
    if (i > 0 && lines[i - 1].trim() === "@override") isOverride = true;

    // class ClassName extends/implements/with ... {
    let match = trimmed.match(/^(?:abstract\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (match) {
      fnName = match[1];
      params = [];
      returnType = "class";
      isExported = !fnName.startsWith("_");

      const startLine = i;
      let braceCount = 0;
      let bodyStarted = false;
      let endLine = i;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (let k = 0; k < l.length; k++) {
          if (l[k] === "{") { braceCount++; bodyStarted = true; }
          else if (l[k] === "}") { braceCount--; }
        }
        if (bodyStarted && braceCount <= 0) { endLine = j; break; }
        if (j === lines.length - 1) endLine = j;
      }

      const body = lines.slice(startLine, endLine + 1).join("\n");
      const calls = extractCalls(body, fnName);

      functions.push({
        name: fnName, file: filePath,
        startLine: startLine + 1, endLine: endLine + 1,
        params, returnType, type: isExported ? "export" : "internal",
        isAsync: false, isExported, calls, body,
      });
      continue;
    }

    // Handle static keyword
    let lineToCheck = trimmed;
    if (lineToCheck.startsWith("static ")) {
      isStatic = true;
      lineToCheck = lineToCheck.replace(/^static\s+/, "");
    }

    // Future<Type> funcName(params) async {
    match = lineToCheck.match(/^(Future\s*<[^>]+>)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
    if (match) {
      returnType = match[1];
      fnName = match[2];
      params = parseDartParams(match[3]);
      isAsync = true;
    }

    // ReturnType funcName(params) { or ReturnType funcName(params) async {
    if (!fnName) {
      match = lineToCheck.match(/^([A-Za-z_][A-Za-z0-9_<>?]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "class"].includes(match[2])) {
        returnType = match[1];
        fnName = match[2];
        params = parseDartParams(match[3]);
        isAsync = !!match[4];
      }
    }

    // void/dynamic funcName(params) { — explicit void/dynamic return
    if (!fnName) {
      match = lineToCheck.match(/^(void|dynamic)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match) {
        returnType = match[1];
        fnName = match[2];
        params = parseDartParams(match[3]);
        isAsync = !!match[4];
      }
    }

    // funcName(params) { — no return type (constructors, etc.)
    if (!fnName) {
      match = lineToCheck.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "class", "import", "export"].includes(match[1])) {
        fnName = match[1];
        params = parseDartParams(match[2]);
        returnType = "dynamic";
        isAsync = !!match[3];
      }
    }

    if (!fnName) continue;

    // In Dart, names starting with _ are private (not exported)
    isExported = !fnName.startsWith("_");

    // Track braces for body extraction
    const startLine = i;
    let braceCount = 0;
    let bodyStarted = false;
    let endLine = i;

    for (let j = i; j < lines.length; j++) {
      const l = lines[j];
      for (let k = 0; k < l.length; k++) {
        if (l[k] === "{") { braceCount++; bodyStarted = true; }
        else if (l[k] === "}") { braceCount--; }
      }
      if (bodyStarted && braceCount <= 0) { endLine = j; break; }
      if (j === lines.length - 1) endLine = j;
    }

    const body = lines.slice(startLine, endLine + 1).join("\n");
    const calls = extractCalls(body, fnName);

    let fnType = isExported ? "export" : "internal";

    functions.push({
      name: fnName, file: filePath,
      startLine: startLine + 1, endLine: endLine + 1,
      params, returnType, type: fnType,
      isAsync, isExported, calls, body,
    });
  }

  return functions;
}

export function parseParams(paramStr) {
  if (!paramStr || !paramStr.trim()) return [];
  return paramStr.split(",").map((p) => {
    const trimmed = p.trim();
    const colonMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$?]*)\s*:\s*(.+)/);
    if (colonMatch) return { name: colonMatch[1], type: colonMatch[2].trim() };
    const eqMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$?]*)\s*=\s*(.+)/);
    if (eqMatch) {
      const val = eqMatch[2].trim();
      let type = "any";
      if (val === "true" || val === "false") type = "boolean";
      else if (/^['"`]/.test(val)) type = "string";
      else if (/^\d/.test(val)) type = "number";
      else if (val.startsWith("[")) type = "array";
      else if (val.startsWith("{")) type = "object";
      else if (val === "null") type = "null";
      return { name: eqMatch[1], type };
    }
    if (trimmed.startsWith("{")) return { name: trimmed, type: "object" };
    if (trimmed.startsWith("[")) return { name: trimmed, type: "array" };
    if (trimmed.startsWith("...")) return { name: trimmed, type: "rest" };
    const idMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$?]*)/);
    if (idMatch) return { name: idMatch[1], type: "any" };
    return { name: trimmed, type: "any" };
  }).filter((p) => p.name);
}

export function extractCalls(body, selfName) {
  const calls = new Set();
  const callRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let m;
  const skip = new Set([
    selfName, "if", "for", "while", "switch", "catch", "return", "new", "typeof",
    "instanceof", "delete", "void", "throw", "class", "import", "export",
    "require", "console", "setTimeout", "setInterval", "clearTimeout",
    "clearInterval", "parseInt", "parseFloat", "JSON", "Object", "Array",
    "String", "Number", "Boolean", "Math", "Date", "Promise", "RegExp",
    "Error", "Map", "Set", "Symbol", "Proxy", "Reflect",
    // Go built-ins
    "fmt", "log", "errors", "strings", "strconv", "context", "sync", "time",
    "http", "json", "os", "io", "bufio", "bytes", "make", "append", "len",
    "cap", "panic", "recover", "close", "copy", "range", "defer", "go",
    "select", "chan",
    // Dart built-ins
    "print", "debugPrint", "setState", "initState", "dispose", "build",
    "super", "Widget", "BuildContext", "Navigator", "MaterialApp", "Scaffold",
    "Container", "Column", "Row", "Text", "Center", "Padding", "SizedBox",
    "ListView",
  ]);
  while ((m = callRegex.exec(body)) !== null) {
    if (!skip.has(m[1])) calls.add(m[1]);
  }
  return Array.from(calls);
}

export function inferReturnType(body, isAsync) {
  if (/return\s+\[/.test(body)) return isAsync ? "Promise<array>" : "array";
  if (/return\s+\{/.test(body)) return isAsync ? "Promise<object>" : "object";
  if (/return\s+(true|false)/.test(body)) return isAsync ? "Promise<boolean>" : "boolean";
  if (/return\s+['"`]/.test(body)) return isAsync ? "Promise<string>" : "string";
  if (/return\s+\d/.test(body)) return isAsync ? "Promise<number>" : "number";
  if (/return\s+null/.test(body)) return isAsync ? "Promise<null>" : "null";
  if (/return\s+</.test(body)) return "JSX.Element";
  if (/return\s+\([\s]*</.test(body)) return "JSX.Element";
  if (!/\breturn\b/.test(body)) return isAsync ? "Promise<void>" : "void";
  return isAsync ? "Promise<any>" : "any";
}

// ── Call graph builder ───────────────────────────────────────────────────────

// ── String/comment-aware brace counting ─────────────────────────────────────
function countBracesInLine(line) {
  let count = 0, inStr = false, quote = "", inBlock = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i], nx = line[i + 1];
    if (inBlock) { if (ch === "*" && nx === "/") { inBlock = false; i++; } continue; }
    if (inStr) { if (ch === "\\") { i++; continue; } if (ch === quote) inStr = false; continue; }
    if (ch === "/" && nx === "/") break;
    if (ch === "/" && nx === "*") { inBlock = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; quote = ch; continue; }
    if (ch === "{") count++;
    else if (ch === "}") count--;
  }
  return count;
}

// Track braces from startLine to find the matching close brace
function findBodyEnd(lines, startLine) {
  let braceCount = 0;
  let bodyStarted = false;
  for (let j = startLine; j < lines.length; j++) {
    braceCount += countBracesInLine(lines[j]);
    if (braceCount > 0) bodyStarted = true;
    if (bodyStarted && braceCount <= 0) return j;
  }
  return lines.length - 1;
}

// ── PSI Dispatcher ──────────────────────────────────────────────────────────
import { PSI_KIND } from "./psiTypes";

export function parseFilePsi(content, filePath) {
  if (filePath.endsWith(".go")) return parseFilePsiGo(content, filePath);
  if (filePath.endsWith(".dart")) return parseFilePsiDart(content, filePath);
  if (filePath.endsWith(".py")) return parseFilePsiPython(content, filePath);
  if (filePath.endsWith(".swift")) return parseFilePsiSwift(content, filePath);
  if (filePath.endsWith(".kt")) return parseFilePsiKotlin(content, filePath);
  if (filePath.endsWith(".sql")) return parseFilePsiSQL(content, filePath);
  return parseFilePsiJS(content, filePath);
}

// ── JS/TS PSI parser ────────────────────────────────────────────────────────
function parseFilePsiJS(content, filePath) {
  const lines = content.split("\n");
  const elements = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Track block comments
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    let match;

    // ── Import declarations ─────────────────────────────────────────────
    if (trimmed.startsWith("import ")) {
      let fullLine = trimmed;
      // Handle multi-line imports
      if (trimmed.includes("{") && !trimmed.includes("}")) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes("}")) {
          fullLine += " " + lines[j].trim();
          j++;
        }
        if (j < lines.length) fullLine += " " + lines[j].trim();
      }

      const fromMatch = fullLine.match(/from\s+['"]([^'"]+)['"]/);
      if (!fromMatch) continue;
      const source = fromMatch[1];
      const bindings = [];

      // import { A, B as C } from "path"
      const namedMatch = fullLine.match(/\{([^}]+)\}/);
      if (namedMatch) {
        namedMatch[1].split(",").forEach(part => {
          const asMatch = part.trim().match(/^(\S+)\s+as\s+(\S+)$/);
          if (asMatch) bindings.push({ local: asMatch[2], imported: asMatch[1] });
          else if (part.trim()) bindings.push({ local: part.trim(), imported: part.trim() });
        });
      }

      // import D from "path" (default)
      const defaultMatch = fullLine.match(/^import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:,|\s+from)/);
      if (defaultMatch && defaultMatch[1] !== "type") {
        bindings.push({ local: defaultMatch[1], imported: "default", isDefault: true });
      }

      // import * as NS from "path"
      const nsMatch = fullLine.match(/\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (nsMatch) {
        bindings.push({ local: nsMatch[1], imported: "*", isNamespace: true });
      }

      elements.push({
        kind: PSI_KIND.IMPORT, name: source, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source, resolvedFile: null, bindings,
      });
      continue;
    }

    // ── Export { ... } from "path" (re-exports) ─────────────────────────
    if (trimmed.startsWith("export ") && trimmed.includes(" from ")) {
      const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
      if (fromMatch) {
        const source = fromMatch[1];
        const bindings = [];
        const namedMatch = trimmed.match(/\{([^}]+)\}/);
        if (namedMatch) {
          namedMatch[1].split(",").forEach(part => {
            const asMatch = part.trim().match(/^(\S+)\s+as\s+(\S+)$/);
            if (asMatch) bindings.push({ local: asMatch[2], exported: asMatch[1] });
            else if (part.trim()) bindings.push({ local: part.trim(), exported: part.trim() });
          });
        }
        elements.push({
          kind: PSI_KIND.EXPORT, name: source, file: filePath,
          startLine: i + 1, endLine: i + 1, isExported: true,
          source, bindings, isDefault: false,
        });
        continue;
      }
    }

    // ── TypeScript interface ────────────────────────────────────────────
    match = trimmed.match(/^(export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]*>)?\s*(?:extends\s+([\w$.,\s]+))?\s*\{/);
    if (match) {
      const isExported = !!match[1];
      const name = match[2];
      const extends_ = match[3] ? match[3].split(",").map(s => s.trim()) : [];
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j < endLine; j++) {
        const memberMatch = lines[j].trim().match(/^(\w+)\s*[?]?\s*:\s*(.+?)\s*[;,]?\s*$/);
        if (memberMatch) members.push({ name: memberMatch[1], type: memberMatch[2] });
      }
      elements.push({
        kind: PSI_KIND.INTERFACE, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported,
        extends_, members,
      });
      continue;
    }

    // ── TypeScript type alias ───────────────────────────────────────────
    match = trimmed.match(/^(export\s+)?type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]*>)?\s*=/);
    if (match) {
      const isExported = !!match[1];
      const name = match[2];
      // Find end — could be single line or multi-line
      let endLine = i;
      if (trimmed.includes("{")) {
        endLine = findBodyEnd(lines, i);
      } else {
        // Scan for semicolon or next declaration
        let j = i;
        while (j < lines.length - 1 && !lines[j].includes(";")) j++;
        endLine = j;
      }
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported,
        definition: lines.slice(i, endLine + 1).join("\n").replace(/^.*?=\s*/, ""),
      });
      continue;
    }

    // ── Enum ────────────────────────────────────────────────────────────
    match = trimmed.match(/^(export\s+)?(const\s+)?enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\{/);
    if (match) {
      const isExported = !!match[1];
      const name = match[3];
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j <= endLine; j++) {
        const memMatch = lines[j].trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*(.+?))?\s*[,}]?\s*$/);
        if (memMatch && memMatch[1]) members.push({ name: memMatch[1], value: memMatch[2] || null });
      }
      elements.push({
        kind: PSI_KIND.ENUM, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported,
        members,
      });
      continue;
    }

    // ── Class declaration ───────────────────────────────────────────────
    match = trimmed.match(/^(export\s+)?(default\s+)?(abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]*>)?\s*(?:extends\s+([\w$.]+))?\s*(?:implements\s+([\w$.,\s]+))?\s*\{?/);
    if (match) {
      const isExported = !!match[1] || !!match[2];
      const name = match[4];
      const extends_ = match[5] || null;
      const implements_ = match[6] ? match[6].split(",").map(s => s.trim()) : [];
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      const calls = extractCalls(body, name);
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported,
        extends_, implements_, methods: [], properties: [],
        calls, body,
      });
      // Don't skip — let methods inside be parsed too
      continue;
    }

    // ── Function declarations (same 4 patterns as legacy parser) ────────
    let fnName = null, isExported = false, isAsync = false, params = [];

    // export async function name(...)
    match = trimmed.match(/^(export\s+)?(default\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/);
    if (match) {
      isExported = !!match[1] || !!match[2]; isAsync = !!match[3]; fnName = match[4]; params = parseParams(match[5]);
    }

    // export const name = (async)? (...) =>
    if (!fnName) {
      match = trimmed.match(/^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/);
      if (match) {
        isExported = !!match[1]; isAsync = !!match[4]; fnName = match[3]; params = parseParams(match[5]);
      }
    }

    // export const name = (async)? function(...)
    if (!fnName) {
      match = trimmed.match(/^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/);
      if (match) {
        isExported = !!match[1]; isAsync = !!match[4]; fnName = match[3]; params = parseParams(match[5]);
      }
    }

    // Class method: name(...) {
    if (!fnName) {
      match = trimmed.match(/^(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "import", "export"].includes(match[2])) {
        isAsync = !!match[1]; fnName = match[2]; params = parseParams(match[3]);
      }
    }

    if (fnName) {
      const startLine = i;
      const endLine = findBodyEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join("\n");
      const calls = extractCalls(body, fnName);
      const returnType = inferReturnType(body, isAsync);
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: startLine + 1, endLine: endLine + 1, isExported, isAsync,
        params, returnType, calls, body,
      });
      continue;
    }

    // ── Variable declarations (non-function) ────────────────────────────
    match = trimmed.match(/^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*([^=]+?))?\s*=/);
    if (match) {
      const isExp = !!match[1];
      const varKind = match[2];
      const name = match[3];
      const valueType = match[4]?.trim() || null;
      elements.push({
        kind: PSI_KIND.VARIABLE, name, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: isExp,
        varKind, valueType,
      });
      continue;
    }

    // ── Destructured declarations ───────────────────────────────────────
    match = trimmed.match(/^(export\s+)?(const|let|var)\s+(\{[^}]+\}|\[[^\]]+\])\s*=/);
    if (match) {
      const isExp = !!match[1];
      const varKind = match[2];
      const destructured = match[3];
      // Extract individual names from { A, B: C, ...rest }
      const names = [];
      const inner = destructured.slice(1, -1);
      inner.split(",").forEach(part => {
        const t = part.trim();
        if (!t || t.startsWith("...")) return;
        const colonPart = t.split(":").pop().trim();
        if (/^[a-zA-Z_$]/.test(colonPart)) names.push(colonPart);
      });
      for (const name of names) {
        elements.push({
          kind: PSI_KIND.VARIABLE, name, file: filePath,
          startLine: i + 1, endLine: i + 1, isExported: isExp,
          varKind, valueType: null,
        });
      }
      continue;
    }
  }

  return elements;
}

// ── Go PSI parser ───────────────────────────────────────────────────────────
function parseFilePsiGo(content, filePath) {
  const lines = content.split("\n");
  const elements = [];
  let inBlockComment = false;
  let inConstBlock = false, constBlockStart = -1;
  let inVarBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//")) continue;

    let match;

    // ── Import block ────────────────────────────────────────────────────
    if (trimmed.startsWith("import ")) {
      // Single import: import "path"
      match = trimmed.match(/^import\s+(?:(\w+)\s+)?"([^"]+)"/);
      if (match) {
        const alias = match[1] || match[2].split("/").pop();
        elements.push({
          kind: PSI_KIND.IMPORT, name: match[2], file: filePath,
          startLine: i + 1, endLine: i + 1, isExported: false,
          source: match[2], resolvedFile: null,
          bindings: [{ local: alias, imported: "*", isNamespace: true }],
        });
        continue;
      }
      // Block import: import ( ... )
      if (trimmed === "import (") {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith(")")) {
          const lineMatch = lines[j].trim().match(/^(?:(\w+)\s+)?"([^"]+)"/);
          if (lineMatch) {
            const alias = lineMatch[1] || lineMatch[2].split("/").pop();
            elements.push({
              kind: PSI_KIND.IMPORT, name: lineMatch[2], file: filePath,
              startLine: j + 1, endLine: j + 1, isExported: false,
              source: lineMatch[2], resolvedFile: null,
              bindings: [{ local: alias, imported: "*", isNamespace: true }],
            });
          }
          j++;
        }
        continue;
      }
    }

    // ── Const/var block ─────────────────────────────────────────────────
    if (trimmed === "const (" || trimmed === "var (") {
      const isConst = trimmed.startsWith("const");
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(")")) {
        const cMatch = lines[j].trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*/);
        if (cMatch && cMatch[1] !== "_") {
          elements.push({
            kind: PSI_KIND.VARIABLE, name: cMatch[1], file: filePath,
            startLine: j + 1, endLine: j + 1, isExported: /^[A-Z]/.test(cMatch[1]),
            varKind: isConst ? "const" : "var", valueType: null,
          });
        }
        j++;
      }
      continue;
    }

    // Single const/var: const Name = value or var Name Type = value
    match = trimmed.match(/^(const|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
    if (match && !trimmed.startsWith("const (") && !trimmed.startsWith("var (")) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[2], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: /^[A-Z]/.test(match[2]),
        varKind: match[1], valueType: null,
      });
      continue;
    }

    // ── type Name struct { ──────────────────────────────────────────────
    match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+struct\s*\{/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: /^[A-Z]/.test(name),
        extends_: null, implements_: [], methods: [], properties: [],
        calls: extractCalls(body, name), body,
      });
      continue;
    }

    // ── type Name interface { ───────────────────────────────────────────
    match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+interface\s*\{/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j < endLine; j++) {
        const mMatch = lines[j].trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (mMatch) members.push({ name: mMatch[1], type: "method" });
      }
      elements.push({
        kind: PSI_KIND.INTERFACE, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: /^[A-Z]/.test(name),
        extends_: [], members,
      });
      continue;
    }

    // ── type Name = OtherType (alias) ───────────────────────────────────
    match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: /^[A-Z]/.test(match[1]),
        definition: match[2],
      });
      continue;
    }

    // ── type Name underlying (custom type) ──────────────────────────────
    match = trimmed.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(\S+)/);
    if (match && !["struct", "interface"].includes(match[2])) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: /^[A-Z]/.test(match[1]),
        definition: match[2],
      });
      continue;
    }

    // ── func (r *Type) Method(params) returnType { ──────────────────────
    match = trimmed.match(/^func\s+\([^)]*\)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(.*)/);
    if (match) {
      const fnName = match[1];
      const params = parseGoParams(match[2]);
      let returnType = "void";
      const rest = match[3];
      const multiReturn = rest.match(/^\(([^)]+)\)\s*\{/);
      if (multiReturn) returnType = "(" + multiReturn[1] + ")";
      else {
        const singleReturn = rest.match(/^([a-zA-Z_*[\]{}.<>]+)\s*\{/);
        if (singleReturn) returnType = singleReturn[1];
      }
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.METHOD, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: /^[A-Z]/.test(fnName),
        isAsync: /\bgo\s+/.test(body), params, returnType,
        calls: extractCalls(body, fnName), body,
      });
      continue;
    }

    // ── func FuncName(params) returnType { ──────────────────────────────
    match = trimmed.match(/^func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(.*)/);
    if (match) {
      const fnName = match[1];
      const params = parseGoParams(match[2]);
      let returnType = "void";
      const rest = match[3];
      const multiReturn = rest.match(/^\(([^)]+)\)\s*\{/);
      if (multiReturn) returnType = "(" + multiReturn[1] + ")";
      else {
        const singleReturn = rest.match(/^([a-zA-Z_*[\]{}.<>]+)\s*\{/);
        if (singleReturn) returnType = singleReturn[1];
      }
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: /^[A-Z]/.test(fnName),
        isAsync: /\bgo\s+/.test(body), params, returnType,
        calls: extractCalls(body, fnName), body,
      });
      continue;
    }
  }

  return elements;
}

// ── Dart PSI parser ─────────────────────────────────────────────────────────
function parseFilePsiDart(content, filePath) {
  const lines = content.split("\n");
  const elements = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//")) continue;

    let match;

    // ── Import declarations ─────────────────────────────────────────────
    match = trimmed.match(/^import\s+['"]([^'"]+)['"]\s*(.*)/);
    if (match) {
      const source = match[1];
      const rest = match[2];
      const bindings = [];
      const asMatch = rest.match(/as\s+(\w+)/);
      if (asMatch) {
        bindings.push({ local: asMatch[1], imported: "*", isNamespace: true });
      }
      const showMatch = rest.match(/show\s+([\w,\s]+)/);
      if (showMatch) {
        showMatch[1].split(",").forEach(s => {
          const name = s.trim();
          if (name) bindings.push({ local: name, imported: name });
        });
      }
      if (bindings.length === 0) {
        // Side-effect import — derive package name
        const pkg = source.split("/").pop().replace(".dart", "");
        bindings.push({ local: pkg, imported: "*", isNamespace: true });
      }
      elements.push({
        kind: PSI_KIND.IMPORT, name: source, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source, resolvedFile: null, bindings,
      });
      continue;
    }

    // ── Export declarations ──────────────────────────────────────────────
    match = trimmed.match(/^export\s+['"]([^'"]+)['"]/);
    if (match) {
      elements.push({
        kind: PSI_KIND.EXPORT, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        source: match[1], bindings: [], isDefault: false,
      });
      continue;
    }

    // ── Enum ────────────────────────────────────────────────────────────
    match = trimmed.match(/^enum\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j <= endLine; j++) {
        const memMatch = lines[j].trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (memMatch && memMatch[1] !== "}") members.push({ name: memMatch[1], value: null });
      }
      elements.push({
        kind: PSI_KIND.ENUM, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !name.startsWith("_"),
        members,
      });
      continue;
    }

    // ── Mixin / Extension ───────────────────────────────────────────────
    match = trimmed.match(/^(mixin|extension)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+on\s+(\w+)/);
    if (match) {
      const name = match[2];
      const endLine = findBodyEnd(lines, i);
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !name.startsWith("_"),
        extends_: match[3], implements_: [], methods: [], properties: [],
        calls: [], body: lines.slice(i, endLine + 1).join("\n"),
      });
      continue;
    }

    // ── Class declaration ───────────────────────────────────────────────
    match = trimmed.match(/^(?:abstract\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      const extendsMatch = trimmed.match(/extends\s+(\w+)/);
      const implementsMatch = trimmed.match(/implements\s+([\w,\s]+)/);
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !name.startsWith("_"),
        extends_: extendsMatch?.[1] || null,
        implements_: implementsMatch ? implementsMatch[1].split(",").map(s => s.trim()) : [],
        methods: [], properties: [], calls: extractCalls(body, name), body,
      });
      continue;
    }

    // ── Typedef ─────────────────────────────────────────────────────────
    match = trimmed.match(/^typedef\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: !match[1].startsWith("_"),
        definition: trimmed.replace(/^typedef\s+\w+\s*=?\s*/, ""),
      });
      continue;
    }

    // ── Top-level variables ─────────────────────────────────────────────
    match = trimmed.match(/^(final|const|late\s+final|late)\s+(?:(\w+(?:<[^>]+>)?)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (match) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[3], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: !match[3].startsWith("_"),
        varKind: match[1].includes("const") ? "const" : "var",
        valueType: match[2] || null,
      });
      continue;
    }

    // ── Function/method declarations ────────────────────────────────────
    let lineToCheck = trimmed;
    let isStatic = false;
    if (lineToCheck.startsWith("static ")) { isStatic = true; lineToCheck = lineToCheck.replace(/^static\s+/, ""); }

    let fnName = null, params = [], returnType = "void", isAsync = false;

    // Future<Type> funcName(params) async {
    match = lineToCheck.match(/^(Future\s*<[^>]+>)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
    if (match) { returnType = match[1]; fnName = match[2]; params = parseDartParams(match[3]); isAsync = true; }

    if (!fnName) {
      match = lineToCheck.match(/^([A-Za-z_][A-Za-z0-9_<>?]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "class"].includes(match[2])) {
        returnType = match[1]; fnName = match[2]; params = parseDartParams(match[3]); isAsync = !!match[4];
      }
    }

    if (!fnName) {
      match = lineToCheck.match(/^(void|dynamic)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match) { returnType = match[1]; fnName = match[2]; params = parseDartParams(match[3]); isAsync = !!match[4]; }
    }

    if (!fnName) {
      match = lineToCheck.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(async\s*)?\{/);
      if (match && !["if", "for", "while", "switch", "catch", "else", "return", "new", "class", "import", "export"].includes(match[1])) {
        fnName = match[1]; params = parseDartParams(match[2]); returnType = "dynamic"; isAsync = !!match[3];
      }
    }

    if (fnName) {
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !fnName.startsWith("_"),
        isAsync, params, returnType,
        calls: extractCalls(body, fnName), body,
      });
    }
  }

  return elements;
}

// ── Python PSI parser ───────────────────────────────────────────────────────
function parseFilePsiPython(content, filePath) {
  const lines = content.split("\n");
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) continue;

    let match;

    // ── Import declarations ─────────────────────────────────────────────
    match = trimmed.match(/^from\s+(\S+)\s+import\s+(.+)/);
    if (match) {
      const source = match[1];
      const bindings = [];
      match[2].split(",").forEach(part => {
        const asMatch = part.trim().match(/^(\S+)\s+as\s+(\S+)$/);
        if (asMatch) bindings.push({ local: asMatch[2], imported: asMatch[1] });
        else {
          const name = part.trim();
          if (name && name !== "*") bindings.push({ local: name, imported: name });
          if (name === "*") bindings.push({ local: source.split(".").pop(), imported: "*", isNamespace: true });
        }
      });
      elements.push({
        kind: PSI_KIND.IMPORT, name: source, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source, resolvedFile: null, bindings,
      });
      continue;
    }

    match = trimmed.match(/^import\s+(\S+)(\s+as\s+(\S+))?/);
    if (match && !trimmed.startsWith("import ") === false) {
      const source = match[1];
      const alias = match[3] || source.split(".").pop();
      elements.push({
        kind: PSI_KIND.IMPORT, name: source, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source, resolvedFile: null,
        bindings: [{ local: alias, imported: "*", isNamespace: true }],
      });
      continue;
    }

    // ── Class declaration ───────────────────────────────────────────────
    match = trimmed.match(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?\s*:/);
    if (match) {
      const name = match[1];
      const bases = match[2] ? match[2].split(",").map(s => s.trim()) : [];
      // Find end of class by indentation
      const indent = lines[i].search(/\S/);
      let endLine = i;
      for (let j = i + 1; j < lines.length; j++) {
        const lineIndent = lines[j].search(/\S/);
        if (lines[j].trim() === "") continue;
        if (lineIndent <= indent) break;
        endLine = j;
      }
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !name.startsWith("_"),
        extends_: bases[0] || null, implements_: bases.slice(1),
        methods: [], properties: [], calls: extractCalls(body, name), body,
      });
      continue;
    }

    // ── Function/method declaration ─────────────────────────────────────
    match = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*(.+?))?\s*:/);
    if (match) {
      const fnName = match[1];
      const isAsync = trimmed.startsWith("async ");
      const returnType = match[3] || "None";
      const params = match[2].split(",").map(p => {
        const t = p.trim();
        if (!t || t === "self" || t === "cls") return null;
        const colonMatch = t.match(/^(\w+)\s*:\s*(.+?)(?:\s*=.*)?$/);
        if (colonMatch) return { name: colonMatch[1], type: colonMatch[2] };
        const eqMatch = t.match(/^(\w+)\s*=/);
        if (eqMatch) return { name: eqMatch[1], type: "any" };
        return { name: t.replace(/[*:].*/g, ""), type: "any" };
      }).filter(Boolean);

      // Find end by indentation
      const indent = lines[i].search(/\S/);
      let endLine = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const lineIndent = lines[j].search(/\S/);
        if (lineIndent <= indent) break;
        endLine = j;
      }
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1,
        isExported: !fnName.startsWith("_"),
        isAsync, params, returnType,
        calls: extractCalls(body, fnName), body,
      });
      continue;
    }

    // ── Top-level variable assignment ───────────────────────────────────
    match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*(?::\s*\w+)?\s*=/);
    if (match && lines[i].search(/\S/) === 0) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        varKind: "const", valueType: null,
      });
    }
  }

  return elements;
}

// ── Swift PSI parser ────────────────────────────────────────────────────────
function parseFilePsiSwift(content, filePath) {
  const lines = content.split("\n");
  const elements = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//")) continue;

    let match;

    // ── Import ──────────────────────────────────────────────────────────
    match = trimmed.match(/^import\s+(\w+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.IMPORT, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source: match[1], resolvedFile: null,
        bindings: [{ local: match[1], imported: "*", isNamespace: true }],
      });
      continue;
    }

    // ── Protocol (→ INTERFACE) ──────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|open\s+)?protocol\s+([a-zA-Z_]\w*)\s*(?::\s*([\w,\s]+))?\s*\{/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      elements.push({
        kind: PSI_KIND.INTERFACE, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        extends_: match[2] ? match[2].split(",").map(s => s.trim()) : [],
        members: [],
      });
      continue;
    }

    // ── Enum ────────────────────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|open\s+)?enum\s+([a-zA-Z_]\w*)\s*(?::\s*(\w+))?\s*\{/);
    if (match) {
      const name = match[1];
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j <= endLine; j++) {
        const caseMatch = lines[j].trim().match(/^case\s+(\w+)/);
        if (caseMatch) members.push({ name: caseMatch[1], value: null });
      }
      elements.push({
        kind: PSI_KIND.ENUM, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        members,
      });
      continue;
    }

    // ── Class / Struct / Extension ──────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|open\s+)?(?:final\s+)?(class|struct|extension)\s+([a-zA-Z_]\w*)\s*(?::\s*([\w,\s]+))?\s*\{/);
    if (match) {
      const name = match[2];
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        extends_: match[3]?.split(",")[0]?.trim() || null,
        implements_: match[3] ? match[3].split(",").slice(1).map(s => s.trim()) : [],
        methods: [], properties: [], calls: extractCalls(body, name), body,
      });
      continue;
    }

    // ── Typealias ───────────────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+)?typealias\s+([a-zA-Z_]\w*)\s*=\s*(.+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        definition: match[2],
      });
      continue;
    }

    // ── Function / Method ───────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|open\s+)?(?:override\s+)?(?:static\s+)?(?:class\s+)?func\s+([a-zA-Z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*(\S+))?\s*\{?/);
    if (match) {
      const fnName = match[1];
      const params = match[2] ? match[2].split(",").map(p => {
        const parts = p.trim().split(/\s*:\s*/);
        return { name: parts[0].split(/\s+/).pop() || parts[0], type: parts[1]?.trim() || "Any" };
      }).filter(p => p.name) : [];
      const endLine = findBodyEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !trimmed.startsWith("private"),
        isAsync: trimmed.includes("async"), params, returnType: match[3] || "Void",
        calls: extractCalls(body, fnName), body,
      });
      continue;
    }

    // ── Property (let/var) ──────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|open\s+)?(?:static\s+)?(?:lazy\s+)?(let|var)\s+([a-zA-Z_]\w*)\s*:\s*(\S+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[2], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: !trimmed.startsWith("private"),
        varKind: match[1] === "let" ? "const" : "var", valueType: match[3],
      });
    }
  }

  return elements;
}

// ── Kotlin PSI parser ───────────────────────────────────────────────────────
function parseFilePsiKotlin(content, filePath) {
  const lines = content.split("\n");
  const elements = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//")) continue;

    let match;

    // ── Import ──────────────────────────────────────────────────────────
    match = trimmed.match(/^import\s+([\w.]+)(?:\.\*)?/);
    if (match) {
      const source = match[1];
      const name = source.split(".").pop();
      elements.push({
        kind: PSI_KIND.IMPORT, name: source, file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: false,
        source, resolvedFile: null,
        bindings: [{ local: name, imported: name }],
      });
      continue;
    }

    // ── Interface ───────────────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|protected\s+)?interface\s+([a-zA-Z_]\w*)\s*(?::\s*([\w,\s]+))?\s*\{/);
    if (match) {
      const endLine = findBodyEnd(lines, i);
      elements.push({
        kind: PSI_KIND.INTERFACE, name: match[1], file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        extends_: match[2] ? match[2].split(",").map(s => s.trim()) : [],
        members: [],
      });
      continue;
    }

    // ── Enum class ──────────────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+)?enum\s+class\s+([a-zA-Z_]\w*)\s*\{/);
    if (match) {
      const endLine = findBodyEnd(lines, i);
      const members = [];
      for (let j = i + 1; j <= endLine; j++) {
        const memMatch = lines[j].trim().match(/^([A-Z_][A-Z0-9_]*)/);
        if (memMatch) members.push({ name: memMatch[1], value: null });
      }
      elements.push({
        kind: PSI_KIND.ENUM, name: match[1], file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        members,
      });
      continue;
    }

    // ── Class / Data class / Object / Sealed class ──────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|protected\s+)?(?:abstract\s+)?(?:open\s+)?(data\s+class|sealed\s+class|class|object)\s+([a-zA-Z_]\w*)\s*(?:\([^)]*\))?\s*(?::\s*([\w,\s.(]+))?\s*\{?/);
    if (match) {
      const name = match[2];
      const endLine = trimmed.includes("{") ? findBodyEnd(lines, i) : i;
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.CLASS, name, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: true,
        extends_: match[3]?.split(",")[0]?.trim()?.replace(/\(.*/, "") || null,
        implements_: [], methods: [], properties: [],
        calls: extractCalls(body, name), body,
      });
      continue;
    }

    // ── Typealias ───────────────────────────────────────────────────────
    match = trimmed.match(/^typealias\s+([a-zA-Z_]\w*)\s*=\s*(.+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        definition: match[2],
      });
      continue;
    }

    // ── Function ────────────────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+|protected\s+)?(?:override\s+)?(?:suspend\s+)?fun\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?::\s*(\S+))?\s*\{?/);
    if (match) {
      const fnName = match[1];
      const params = match[2] ? match[2].split(",").map(p => {
        const colonMatch = p.trim().match(/^(\w+)\s*:\s*(.+?)(?:\s*=.*)?$/);
        if (colonMatch) return { name: colonMatch[1], type: colonMatch[2] };
        return { name: p.trim(), type: "Any" };
      }).filter(p => p.name) : [];
      const endLine = trimmed.includes("{") ? findBodyEnd(lines, i) : i;
      const body = lines.slice(i, endLine + 1).join("\n");
      elements.push({
        kind: PSI_KIND.FUNCTION, name: fnName, file: filePath,
        startLine: i + 1, endLine: endLine + 1, isExported: !trimmed.startsWith("private"),
        isAsync: trimmed.includes("suspend"), params, returnType: match[3] || "Unit",
        calls: extractCalls(body, fnName), body,
      });
      continue;
    }

    // ── Property (val/var) ──────────────────────────────────────────────
    match = trimmed.match(/^(?:public\s+|private\s+|internal\s+)?(?:override\s+)?(?:const\s+)?(val|var)\s+([a-zA-Z_]\w*)\s*:\s*(\S+)/);
    if (match) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[2], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: !trimmed.startsWith("private"),
        varKind: match[1] === "val" ? "const" : "var", valueType: match[3],
      });
    }
  }

  return elements;
}

// ── SQL PSI parser ──────────────────────────────────────────────────────────
function parseFilePsiSQL(content, filePath) {
  const lines = content.split("\n");
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("--")) continue;

    let match;

    // CREATE TABLE name
    match = trimmed.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"]+\.)?["']?(\w+)["']?/i);
    if (match) {
      elements.push({
        kind: PSI_KIND.CLASS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        extends_: null, implements_: [], methods: [], properties: [],
        calls: [], body: "",
      });
      continue;
    }

    // CREATE FUNCTION / CREATE OR REPLACE FUNCTION
    match = trimmed.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[\w"]+\.)?["']?(\w+)["']?\s*\(/i);
    if (match) {
      elements.push({
        kind: PSI_KIND.FUNCTION, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        isAsync: false, params: [], returnType: "void", calls: [], body: "",
      });
      continue;
    }

    // CREATE INDEX name
    match = trimmed.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"]+\.)?["']?(\w+)["']?/i);
    if (match) {
      elements.push({
        kind: PSI_KIND.VARIABLE, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        varKind: "const", valueType: "index",
      });
      continue;
    }

    // CREATE TYPE name
    match = trimmed.match(/^CREATE\s+TYPE\s+(?:[\w"]+\.)?["']?(\w+)["']?\s+AS/i);
    if (match) {
      elements.push({
        kind: PSI_KIND.TYPE_ALIAS, name: match[1], file: filePath,
        startLine: i + 1, endLine: i + 1, isExported: true,
        definition: trimmed,
      });
      continue;
    }

    // ALTER TABLE name (record as reference)
    match = trimmed.match(/^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[\w"]+\.)?["']?(\w+)["']?/i);
    if (match) {
      // Don't create a new element, just a reference marker
      // (useful for the stub index to find table usage across migrations)
    }
  }

  return elements;
}

// ── Call graph builder ───────────────────────────────────────────────────────

export function buildCallGraph(allFunctions) {
  const fnMap = new Map();
  for (const fn of allFunctions) {
    const key = `${fn.name}:${fn.file}`;
    fnMap.set(key, { ...fn, incomingKeys: [], outgoingKeys: [] });
  }

  const nameIndex = new Map();
  for (const [key, fn] of fnMap) {
    if (!nameIndex.has(fn.name)) nameIndex.set(fn.name, []);
    nameIndex.get(fn.name).push(key);
  }

  for (const [callerKey, callerFn] of fnMap) {
    for (const calleeName of callerFn.calls) {
      const sameFileKey = `${calleeName}:${callerFn.file}`;
      if (fnMap.has(sameFileKey)) {
        callerFn.outgoingKeys.push(sameFileKey);
        fnMap.get(sameFileKey).incomingKeys.push(callerKey);
      } else if (nameIndex.has(calleeName)) {
        const targetKey = nameIndex.get(calleeName)[0];
        callerFn.outgoingKeys.push(targetKey);
        fnMap.get(targetKey).incomingKeys.push(callerKey);
      }
    }
  }

  return fnMap;
}

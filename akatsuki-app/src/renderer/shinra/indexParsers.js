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
]);

export const CALLGRAPH_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "go", "dart",
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

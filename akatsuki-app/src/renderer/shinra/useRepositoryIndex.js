import { useState, useEffect, useRef, useCallback } from "react";
import {
  IGNORED_DIRS, DEPENDENCY_EXTENSIONS, CALLGRAPH_EXTENSIONS, PSI_EXTENSIONS,
  extRaw, extractImports, resolveImportPath, parseFile, parseFilePsi, buildCallGraph,
} from "./indexParsers";
import { PSI_KIND, psiToLegacyFunction, formatSignature } from "./psiTypes";

// ── Walk directory tree recursively ──────────────────────────────────────────
async function walkDir(dir, maxDepth, depth, extensions) {
  if (depth > maxDepth) return [];
  let result = [];
  try {
    const { entries } = await window.akatsuki.shinra.readDir(dir);
    for (const entry of entries) {
      if (entry.isDir) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const sub = await walkDir(entry.path, maxDepth, depth + 1, extensions);
        result = result.concat(sub);
      } else {
        const ext = extRaw(entry.name);
        if (extensions.has(ext)) {
          result.push(entry.path);
        }
      }
    }
  } catch {}
  return result;
}

// ── Read files in parallel batches ───────────────────────────────────────────
async function readFilesBatch(filePaths, batchSize, onProgress) {
  const contents = {};
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (fp) => {
        try {
          const res = await window.akatsuki.shinra.readFile(fp);
          return { path: fp, content: res.content || "", size: res.size || 0 };
        } catch {
          return { path: fp, content: "", size: 0 };
        }
      })
    );
    for (const r of results) {
      contents[r.path] = { content: r.content, size: r.size };
    }
    if (onProgress) onProgress(Math.min(i + batchSize, filePaths.length));
    // Yield to UI thread
    await new Promise((r) => setTimeout(r, 0));
  }
  return contents;
}

// ── Detect repo type ─────────────────────────────────────────────────────────
function detectRepoType(filePaths) {
  const names = new Set(filePaths.map((fp) => fp.split("/").pop()));
  const hasPackageJson = names.has("package.json");
  const hasPyProject = names.has("requirements.txt") || names.has("pyproject.toml") || names.has("setup.py") || names.has("Pipfile");
  const hasGoMod = names.has("go.mod");
  const hasCargoToml = names.has("Cargo.toml");
  if (hasPackageJson && !hasPyProject && !hasGoMod && !hasCargoToml) return "node";
  if (hasPyProject) return "python";
  if (hasGoMod) return "go";
  if (hasCargoToml) return "rust";
  return "mixed";
}

// ── Build import graph from file contents ────────────────────────────────────
function buildImportGraph(fileContents, fileSet, workDir) {
  const edges = [];
  const importMap = {};
  const importedByMap = {};

  for (const fp of Object.keys(fileContents)) {
    importMap[fp] = [];
    if (!importedByMap[fp]) importedByMap[fp] = [];
  }

  for (const [fp, { content }] of Object.entries(fileContents)) {
    const imports = extractImports(content, fp);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp, fp, fileSet, workDir);
      if (resolved && resolved !== fp) {
        if (!importMap[fp].includes(resolved)) {
          importMap[fp].push(resolved);
          edges.push({ from: fp, to: resolved });
        }
        if (!importedByMap[resolved]) importedByMap[resolved] = [];
        if (!importedByMap[resolved].includes(fp)) {
          importedByMap[resolved].push(fp);
        }
      }
    }
  }

  return { edges, importMap, importedByMap };
}

// ── Build function map from file contents (legacy — for backward compat) ────
function buildFunctionIndex(fileContents) {
  const allFunctions = [];
  for (const [fp, { content }] of Object.entries(fileContents)) {
    const ext = extRaw(fp);
    if (!CALLGRAPH_EXTENSIONS.has(ext)) continue;
    const fns = parseFile(content, fp);
    allFunctions.push(...fns);
  }
  return buildCallGraph(allFunctions);
}

// ── Build PSI file index + stub index ────────────────────────────────────────
function buildPsiIndices(fileContents, fileSet, workDir) {
  const fileIndex = new Map();
  const stubIndex = new Map();

  for (const [fp, { content }] of Object.entries(fileContents)) {
    const ext = extRaw(fp);
    if (!PSI_EXTENSIONS.has(ext)) continue;

    const elements = parseFilePsi(content, fp);
    const imports = elements.filter(e => e.kind === PSI_KIND.IMPORT);
    const exports = new Set(
      elements.filter(e => e.isExported && e.kind !== PSI_KIND.IMPORT).map(e => e.name)
    );

    // Build importBindings: localName → {importedName, sourceFile, isDefault, isNamespace}
    const importBindings = new Map();
    for (const imp of imports) {
      const resolved = resolveImportPath(imp.source, fp, fileSet, workDir);
      imp.resolvedFile = resolved;
      if (resolved) {
        for (const b of (imp.bindings || [])) {
          importBindings.set(b.local, {
            importedName: b.imported,
            sourceFile: resolved,
            isDefault: b.isDefault || false,
            isNamespace: b.isNamespace || false,
          });
        }
      }
    }

    fileIndex.set(fp, { elements, imports, exports, importBindings });

    // Populate stub index with declarations only
    for (const el of elements) {
      if (el.kind === PSI_KIND.IMPORT || el.kind === PSI_KIND.EXPORT) continue;
      if (!stubIndex.has(el.name)) stubIndex.set(el.name, []);
      stubIndex.get(el.name).push({
        file: fp,
        line: el.startLine,
        kind: el.kind,
        isExported: el.isExported,
        signature: formatSignature(el),
      });
    }
  }

  return { fileIndex, stubIndex };
}

// ── Build import resolution cache ───────────────────────────────────────────
function buildImportResolutionCache(fileIndex) {
  const cache = new Map();
  const MAX_DEPTH = 5; // prevent infinite re-export chains

  for (const [fp, data] of fileIndex) {
    const fileCache = new Map();
    for (const [localName, binding] of data.importBindings) {
      const resolved = resolveBinding(binding, fileIndex, 0, MAX_DEPTH, new Set());
      if (resolved) fileCache.set(localName, resolved);
    }
    cache.set(fp, fileCache);
  }
  return cache;
}

// Follow a binding through re-exports to find the actual declaration
function resolveBinding(binding, fileIndex, depth, maxDepth, visited) {
  if (depth >= maxDepth) return null;
  const targetFile = binding.sourceFile;
  if (!targetFile || visited.has(targetFile)) return null;
  visited.add(targetFile);

  const targetData = fileIndex.get(targetFile);
  if (!targetData) return null;

  // Look for a direct declaration matching the imported name
  const lookupName = binding.isDefault ? null : binding.importedName;

  if (lookupName && lookupName !== "*") {
    const decl = targetData.elements.find(
      el => el.name === lookupName && el.isExported && el.kind !== PSI_KIND.IMPORT && el.kind !== PSI_KIND.EXPORT
    );
    if (decl) {
      return {
        resolvedFile: targetFile,
        resolvedName: lookupName,
        line: decl.startLine,
        kind: decl.kind,
        signature: formatSignature(decl),
      };
    }

    // Check if the target file re-exports this name
    const reExport = targetData.importBindings.get(lookupName);
    if (reExport) {
      return resolveBinding(reExport, fileIndex, depth + 1, maxDepth, visited);
    }
  }

  // For default imports, find any default-exported or first exported declaration
  if (binding.isDefault) {
    const defaultDecl = targetData.elements.find(
      el => el.isExported && el.kind !== PSI_KIND.IMPORT && el.kind !== PSI_KIND.EXPORT
    );
    if (defaultDecl) {
      return {
        resolvedFile: targetFile,
        resolvedName: defaultDecl.name,
        line: defaultDecl.startLine,
        kind: defaultDecl.kind,
        signature: formatSignature(defaultDecl),
      };
    }
  }

  // Namespace import — just point to the file
  if (binding.isNamespace) {
    return { resolvedFile: targetFile, resolvedName: "*", line: 1, kind: "module" };
  }

  return null;
}

// ── Derive legacy symbolIndex from stubIndex ────────────────────────────────
function deriveLegacySymbolIndex(stubIndex) {
  const idx = new Map();
  for (const [name, entries] of stubIndex) {
    idx.set(name, entries.map(e => ({
      file: e.file, line: e.line, name,
      type: e.isExported ? "export" : "internal",
      key: `${name}:${e.file}`,
    })));
  }
  return idx;
}

// ── Build route index from PSI elements ─────────────────────────────────────
function buildRouteIndex(fileIndex) {
  const routeIdx = new Map();

  for (const [fp, data] of fileIndex) {
    for (const el of data.elements) {
      if (el.kind !== PSI_KIND.FUNCTION && el.kind !== PSI_KIND.METHOD) continue;
      const body = el.body || "";
      let rm;

      // Go Chi routes
      const goRoutes = /\b(?:r|router|mux)\.(Get|Post|Put|Delete|Patch|Route)\s*\(\s*["'`]([^"'`]+)["'`]/g;
      while ((rm = goRoutes.exec(body)) !== null) {
        const method = rm[1].toUpperCase();
        const path = rm[2].replace(/\{[^}]+\}/g, "{id}").replace(/:[a-zA-Z]+/g, "{id}");
        if (!routeIdx.has(path)) routeIdx.set(path, []);
        routeIdx.get(path).push({ file: fp, line: el.startLine, method, handler: el.name, type: "handler" });
      }
      // Go http.HandleFunc
      const goHttp = /http\.HandleFunc\s*\(\s*["'`]([^"'`]+)["'`]/g;
      while ((rm = goHttp.exec(body)) !== null) {
        const path = rm[1];
        if (!routeIdx.has(path)) routeIdx.set(path, []);
        routeIdx.get(path).push({ file: fp, line: el.startLine, method: "ANY", handler: el.name, type: "handler" });
      }
      // TS/JS: fetch, axios, apiClient
      const tsFetch = /(?:fetch|axios\.(?:get|post|put|delete|patch)|apiClient\.(?:get|post|put|delete|patch))\s*\(\s*[`"']([^`"']+)[`"']/g;
      while ((rm = tsFetch.exec(body)) !== null) {
        const path = rm[1].replace(/\$\{[^}]+\}/g, "{id}").replace(/\?.*$/, "");
        if (!path.startsWith("/") && !path.startsWith("http")) continue;
        const normalized = path.replace(/^https?:\/\/[^/]+/, "");
        if (!routeIdx.has(normalized)) routeIdx.set(normalized, []);
        routeIdx.get(normalized).push({ file: fp, line: el.startLine, method: "CALL", handler: el.name, type: "caller" });
      }
      // Dart HTTP
      const dartHttp = /(?:dio\.(?:get|post|put|delete|patch)|http\.(?:get|post|put|delete))\s*\(\s*(?:Uri\.parse\s*\()?\s*['"]([^'"]+)['"]/gi;
      while ((rm = dartHttp.exec(body)) !== null) {
        const path = rm[1].replace(/\$\{[^}]+\}/g, "{id}").replace(/\?.*$/, "");
        const normalized = path.replace(/^https?:\/\/[^/]+/, "");
        if (!routeIdx.has(normalized)) routeIdx.set(normalized, []);
        routeIdx.get(normalized).push({ file: fp, line: el.startLine, method: "CALL", handler: el.name, type: "caller" });
      }
    }
  }

  return routeIdx;
}

// ── Derive legacy functionMap from PSI fileIndex ────────────────────────────
function deriveFunctionMap(fileIndex) {
  const allFunctions = [];
  for (const [fp, data] of fileIndex) {
    for (const el of data.elements) {
      if (el.kind === PSI_KIND.FUNCTION || el.kind === PSI_KIND.METHOD) {
        allFunctions.push(psiToLegacyFunction(el));
      }
    }
  }
  return buildCallGraph(allFunctions);
}

// ── The hook ─────────────────────────────────────────────────────────────────

export default function useRepositoryIndex(workingDir) {
  const [status, setStatus] = useState("idle"); // idle | scanning | ready | error
  const [progress, setProgress] = useState({ scanned: 0, total: 0, phase: "" });
  const [error, setError] = useState(null);

  const [fileList, setFileList] = useState([]);
  const [fileSet, setFileSet] = useState(new Set());
  const [importGraph, setImportGraph] = useState(null);
  const [functionMap, setFunctionMap] = useState(null);
  const [symbolIndex, setSymbolIndex] = useState(null);
  const [routeIndex, setRouteIndex] = useState(null);
  const [repoType, setRepoType] = useState(null);

  // PSI indices (new)
  const [fileIndex, setFileIndex] = useState(null);
  const [stubIndex, setStubIndex] = useState(null);
  const [importResolutionCache, setImportResolutionCache] = useState(null);

  // Internal refs
  const fileContentsRef = useRef({});
  const scanIdRef = useRef(0);
  const prevWorkingDirRef = useRef(null);

  // ── Full scan ───────────────────────────────────────────────────────────
  const fullScan = useCallback(async () => {
    if (!workingDir) return;
    const scanId = ++scanIdRef.current;

    setStatus("scanning");
    setError(null);
    setProgress({ scanned: 0, total: 0, phase: "walking" });

    try {
      // Phase 1: Walk directory tree
      const files = await walkDir(workingDir, 8, 0, DEPENDENCY_EXTENSIONS);
      if (scanId !== scanIdRef.current) return; // cancelled

      const fSet = new Set(files);
      setFileList(files);
      setFileSet(fSet);
      setRepoType(detectRepoType(files));
      setProgress({ scanned: 0, total: files.length, phase: "reading" });

      // Phase 2: Read file contents in batches
      const contents = await readFilesBatch(files, 20, (n) => {
        if (scanId !== scanIdRef.current) return;
        setProgress((p) => ({ ...p, scanned: n }));
      });
      if (scanId !== scanIdRef.current) return;

      fileContentsRef.current = contents;
      setProgress((p) => ({ ...p, phase: "parsing" }));

      // Yield once before heavy parsing
      await new Promise((r) => setTimeout(r, 0));
      if (scanId !== scanIdRef.current) return;

      // Phase 3: Build PSI file index + stub index
      const { fileIndex: fIdx, stubIndex: sIdx } = buildPsiIndices(contents, fSet, workingDir);
      if (scanId !== scanIdRef.current) return;
      setFileIndex(fIdx);
      setStubIndex(sIdx);

      // Phase 4: Build import resolution cache
      const irc = buildImportResolutionCache(fIdx);
      if (scanId !== scanIdRef.current) return;
      setImportResolutionCache(irc);

      // Phase 5: Build import graph (for dependency diagram — uses legacy extractImports)
      const ig = buildImportGraph(contents, fSet, workingDir);
      if (scanId !== scanIdRef.current) return;
      setImportGraph(ig);

      // Phase 6: Derive legacy functionMap + symbolIndex (backward compat)
      const fm = deriveFunctionMap(fIdx);
      if (scanId !== scanIdRef.current) return;
      setFunctionMap(fm);

      const symbolIdx = deriveLegacySymbolIndex(sIdx);
      setSymbolIndex(symbolIdx);

      // Phase 7: Build route index from PSI elements
      const routeIdx = buildRouteIndex(fIdx);
      setRouteIndex(routeIdx);

      setStatus("ready");
      setProgress({ scanned: files.length, total: files.length, phase: "done" });
    } catch (e) {
      if (scanId !== scanIdRef.current) return;
      setStatus("error");
      setError(e.message || "Index scan failed");
    }
  }, [workingDir]);

  // ── Incremental invalidation ────────────────────────────────────────────
  const invalidateFile = useCallback(async (filePath) => {
    if (status !== "ready" || !workingDir) return;
    try {
      const res = await window.akatsuki.shinra.readFile(filePath);
      const content = res.content || "";
      const size = res.size || 0;

      // Update cached content
      fileContentsRef.current[filePath] = { content, size };

      // Rebuild import graph incrementally
      setImportGraph((prev) => {
        if (!prev) return prev;
        const newEdges = prev.edges.filter((e) => e.from !== filePath);
        const newImportMap = { ...prev.importMap };
        const newImportedByMap = { ...prev.importedByMap };

        const oldImports = prev.importMap[filePath] || [];
        for (const oldTarget of oldImports) {
          if (newImportedByMap[oldTarget]) {
            newImportedByMap[oldTarget] = newImportedByMap[oldTarget].filter((f) => f !== filePath);
          }
        }

        const imports = extractImports(content, filePath);
        const resolved = [];
        for (const imp of imports) {
          const r = resolveImportPath(imp, filePath, fileSet, workingDir);
          if (r && r !== filePath) {
            resolved.push(r);
            newEdges.push({ from: filePath, to: r });
            if (!newImportedByMap[r]) newImportedByMap[r] = [];
            if (!newImportedByMap[r].includes(filePath)) newImportedByMap[r].push(filePath);
          }
        }
        newImportMap[filePath] = resolved;

        return { edges: newEdges, importMap: newImportMap, importedByMap: newImportedByMap };
      });

      // Full rebuild of PSI indices (fast since contents are cached)
      const { fileIndex: fIdx, stubIndex: sIdx } = buildPsiIndices(fileContentsRef.current, fileSet, workingDir);
      setFileIndex(fIdx);
      setStubIndex(sIdx);
      setImportResolutionCache(buildImportResolutionCache(fIdx));

      // Derive legacy indices
      const fm = deriveFunctionMap(fIdx);
      setFunctionMap(fm);
      setSymbolIndex(deriveLegacySymbolIndex(sIdx));
      setRouteIndex(buildRouteIndex(fIdx));
    } catch {}
  }, [status, workingDir, fileSet]);

  // ── Batch invalidation ─────────────────────────────────────────────────
  const invalidateFiles = useCallback(async (paths) => {
    for (const p of paths) {
      await invalidateFile(p);
    }
  }, [invalidateFile]);

  // ── Auto-scan when workingDir changes ──────────────────────────────────
  useEffect(() => {
    if (!workingDir) {
      setStatus("idle");
      setFileList([]);
      setFileSet(new Set());
      setImportGraph(null);
      setFunctionMap(null);
      setSymbolIndex(null);
      setRouteIndex(null);
      setRepoType(null);
      setFileIndex(null);
      setStubIndex(null);
      setImportResolutionCache(null);
      return;
    }
    if (workingDir !== prevWorkingDirRef.current) {
      prevWorkingDirRef.current = workingDir;
      fullScan();
    }
  }, [workingDir, fullScan]);

  return {
    status,
    progress,
    error,
    fileList,
    fileSet,
    importGraph,
    functionMap,
    symbolIndex,
    routeIndex,
    repoType,
    // PSI indices (new)
    fileIndex,
    stubIndex,
    importResolutionCache,
    // Control
    fullScan,
    invalidateFile,
    invalidateFiles,
  };
}

import { useState, useEffect, useRef, useCallback } from "react";
import {
  IGNORED_DIRS, DEPENDENCY_EXTENSIONS, CALLGRAPH_EXTENSIONS,
  extRaw, extractImports, resolveImportPath, parseFile, buildCallGraph,
} from "./indexParsers";

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

// ── Build function map from JS/TS file contents ─────────────────────────────
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

// ── The hook ─────────────────────────────────────────────────────────────────

export default function useRepositoryIndex(workingDir) {
  const [status, setStatus] = useState("idle"); // idle | scanning | ready | error
  const [progress, setProgress] = useState({ scanned: 0, total: 0, phase: "" });
  const [error, setError] = useState(null);

  const [fileList, setFileList] = useState([]);
  const [fileSet, setFileSet] = useState(new Set());
  const [importGraph, setImportGraph] = useState(null);
  const [functionMap, setFunctionMap] = useState(null);
  const [repoType, setRepoType] = useState(null);

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

      // Phase 3: Build import graph
      const ig = buildImportGraph(contents, fSet, workingDir);
      if (scanId !== scanIdRef.current) return;
      setImportGraph(ig);

      // Phase 4: Build function/call graph
      const fm = buildFunctionIndex(contents);
      if (scanId !== scanIdRef.current) return;
      setFunctionMap(fm);

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

        // Clean old imports for this file
        const oldImports = prev.importMap[filePath] || [];
        for (const oldTarget of oldImports) {
          if (newImportedByMap[oldTarget]) {
            newImportedByMap[oldTarget] = newImportedByMap[oldTarget].filter((f) => f !== filePath);
          }
        }

        // Re-extract imports
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

      // Rebuild function map (full rebuild is fast since we have cached contents)
      const fm = buildFunctionIndex(fileContentsRef.current);
      setFunctionMap(fm);
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
      setRepoType(null);
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
    repoType,
    fullScan,
    invalidateFile,
    invalidateFiles,
  };
}

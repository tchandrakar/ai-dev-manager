// ── PSI Reference Resolution (IntelliJ-inspired scope walking) ──────────────
// Given a word at (file, line), resolve it to a declaration by walking:
//   1. Import scope  →  2. File scope  →  3. Project scope (stub index)

import { PSI_KIND } from "./psiTypes";

/**
 * Resolve a symbol name to its declaration(s).
 *
 * @param {string} word             — The identifier to resolve
 * @param {string} currentFile      — Absolute path of the file where the click occurred
 * @param {number} currentLine      — 1-indexed line number of the click
 * @param {Map} fileIndex           — Map<filePath, {elements, imports, exports, importBindings}>
 * @param {Map} stubIndex           — Map<symbolName, Array<{file, line, kind, isExported, signature}>>
 * @param {Map} importResolutionCache — Map<filePath, Map<localName, {resolvedFile, resolvedName, line, kind}>>
 *
 * @returns {null | {file, line, kind?, signature?} | {ambiguous: true, candidates: Array}}
 */
export function resolveReference(word, currentFile, currentLine, fileIndex, stubIndex, importResolutionCache) {
  if (!word || !fileIndex || !stubIndex) return null;

  // ── Step 1: Import scope ──────────────────────────────────────────────────
  // Check if the word is an imported binding in the current file
  const fileCache = importResolutionCache?.get(currentFile);
  if (fileCache && fileCache.has(word)) {
    const resolved = fileCache.get(word);
    if (resolved && resolved.resolvedFile) {
      return {
        file: resolved.resolvedFile,
        line: resolved.line || 1,
        kind: resolved.kind || "symbol",
        signature: resolved.signature || word,
      };
    }
  }

  // Also check raw importBindings for cases the cache missed (e.g. unresolved re-exports)
  const fileData = fileIndex.get(currentFile);
  if (fileData?.importBindings?.has(word)) {
    const binding = fileData.importBindings.get(word);
    if (binding?.sourceFile) {
      const targetData = fileIndex.get(binding.sourceFile);
      if (targetData) {
        // Find the exported declaration in the target file
        const decl = targetData.elements.find(
          el => el.name === binding.importedName && el.isExported && el.kind !== PSI_KIND.IMPORT && el.kind !== PSI_KIND.EXPORT
        );
        if (decl) {
          return { file: binding.sourceFile, line: decl.startLine, kind: decl.kind, signature: decl.name };
        }
        // For default imports, also try matching any default export
        if (binding.isDefault) {
          const defExport = targetData.elements.find(
            el => el.isExported && el.kind !== PSI_KIND.IMPORT && el.kind !== PSI_KIND.EXPORT
          );
          if (defExport) {
            return { file: binding.sourceFile, line: defExport.startLine, kind: defExport.kind, signature: defExport.name };
          }
        }
      }
      // Fallback: navigate to the source file line 1
      return { file: binding.sourceFile, line: 1, kind: "module" };
    }
  }

  // ── Step 2: File scope ────────────────────────────────────────────────────
  // Check for a declaration with matching name in the current file
  if (fileData) {
    const localDecls = fileData.elements.filter(
      el => el.name === word &&
        el.kind !== PSI_KIND.IMPORT && el.kind !== PSI_KIND.EXPORT &&
        // Exclude the click position itself (within ±3 lines) to avoid self-nav
        Math.abs(el.startLine - currentLine) > 3
    );
    if (localDecls.length === 1) {
      return { file: currentFile, line: localDecls[0].startLine, kind: localDecls[0].kind, signature: localDecls[0].name };
    }
    if (localDecls.length > 1) {
      // Find the nearest enclosing scope — prefer the closest declaration above the click
      const above = localDecls.filter(d => d.startLine < currentLine).sort((a, b) => b.startLine - a.startLine);
      if (above.length > 0) {
        return { file: currentFile, line: above[0].startLine, kind: above[0].kind, signature: above[0].name };
      }
      return { file: currentFile, line: localDecls[0].startLine, kind: localDecls[0].kind, signature: localDecls[0].name };
    }
  }

  // ── Step 3: Project scope (stub index) ────────────────────────────────────
  const stubs = stubIndex.get(word);
  if (!stubs || stubs.length === 0) return null;

  // Filter out same-file near-line matches
  const candidates = stubs.filter(
    s => !(s.file === currentFile && Math.abs(s.line - currentLine) < 3)
  );
  if (candidates.length === 0) return null;

  // Prefer exported declarations from other files
  const exported = candidates.filter(s => s.isExported && s.file !== currentFile);
  if (exported.length === 1) {
    return { file: exported[0].file, line: exported[0].line, kind: exported[0].kind, signature: exported[0].signature };
  }
  if (exported.length > 1) {
    return { ambiguous: true, candidates: exported };
  }

  // All candidates (including non-exported)
  if (candidates.length === 1) {
    return { file: candidates[0].file, line: candidates[0].line, kind: candidates[0].kind, signature: candidates[0].signature };
  }
  return { ambiguous: true, candidates };
}

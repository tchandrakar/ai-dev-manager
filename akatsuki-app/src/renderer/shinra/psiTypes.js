// ── PSI Element Types (IntelliJ-inspired) ───────────────────────────────────
// Plain objects with a `kind` discriminator — no classes, stays serializable.

export const PSI_KIND = {
  FUNCTION: "function",
  METHOD: "method",
  CLASS: "class",
  VARIABLE: "variable",
  TYPE_ALIAS: "type_alias",
  INTERFACE: "interface",
  ENUM: "enum",
  ENUM_MEMBER: "enum_member",
  IMPORT: "import",
  EXPORT: "export",
  PROPERTY: "property",
  CONSTRUCTOR: "constructor",
};

// Human-readable signature for popup/hover display
export function formatSignature(el) {
  switch (el.kind) {
    case PSI_KIND.FUNCTION:
    case PSI_KIND.METHOD: {
      const prefix = el.isAsync ? "async " : "";
      const params = (el.params || []).map(p => p.type !== "any" ? `${p.name}: ${p.type}` : p.name).join(", ");
      const ret = el.returnType && el.returnType !== "void" ? `: ${el.returnType}` : "";
      return `${prefix}${el.name}(${params})${ret}`;
    }
    case PSI_KIND.CLASS:
      return `class ${el.name}${el.extends_ ? ` extends ${el.extends_}` : ""}`;
    case PSI_KIND.INTERFACE:
      return `interface ${el.name}${el.extends_?.length ? ` extends ${el.extends_.join(", ")}` : ""}`;
    case PSI_KIND.TYPE_ALIAS:
      return `type ${el.name}`;
    case PSI_KIND.ENUM:
      return `enum ${el.name}`;
    case PSI_KIND.VARIABLE:
      return `${el.varKind || "const"} ${el.name}${el.valueType ? `: ${el.valueType}` : ""}`;
    default:
      return el.name;
  }
}

// Convert a PSI FUNCTION/METHOD element to the legacy shape expected by buildCallGraph
export function psiToLegacyFunction(el) {
  let fnType = "internal";
  if (el.isExported) fnType = "export";
  else if (el.isAsync) fnType = "async";
  else if (
    el.name.startsWith("on") || el.name.startsWith("handle") ||
    (el.params || []).some(p => p.name === "cb" || p.name === "callback" || p.name === "handler")
  ) fnType = "callback";

  return {
    name: el.name,
    file: el.file,
    startLine: el.startLine,
    endLine: el.endLine,
    params: el.params || [],
    returnType: el.returnType || "void",
    type: fnType,
    isAsync: !!el.isAsync,
    isExported: !!el.isExported,
    calls: el.calls || [],
    body: el.body || "",
  };
}

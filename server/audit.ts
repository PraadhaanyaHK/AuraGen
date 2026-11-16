import { createRequire } from "node:module";
import { parse } from "@babel/parser";
import type traverseType from "@babel/traverse";
import type { Node } from "@babel/types";

const require = createRequire(import.meta.url);
const traverse = (
  require("@babel/traverse") as {
    default: typeof traverseType;
  }
).default;

export type AuditFindingCode =
  | "syntax-error"
  | "import"
  | "dynamic-evaluation"
  | "unapproved-global"
  | "network-call"
  | "suspicious-jsx";

export interface AuditFinding {
  code: AuditFindingCode;
  message: string;
  line?: number;
  column?: number;
}

export interface StaticAuditResult {
  analysisType: "static-only";
  syntaxValid: boolean;
  findings: AuditFinding[];
}

const SUSPICIOUS_GLOBALS = new Set([
  "process",
  "globalThis",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "require",
  "module",
  "exports",
  "Deno",
  "Bun",
  "XMLHttpRequest",
  "WebSocket",
]);

const SUSPICIOUS_JSX_TAGS = new Set(["script", "iframe", "object", "embed"]);

function locationOf(node: Node): Pick<AuditFinding, "line" | "column"> {
  if (node.loc === null || node.loc === undefined) {
    return {};
  }
  return { line: node.loc.start.line, column: node.loc.start.column + 1 };
}

function parseErrorLocation(
  error: unknown,
): Pick<AuditFinding, "line" | "column"> {
  if (
    typeof error === "object" &&
    error !== null &&
    "loc" in error &&
    typeof error.loc === "object" &&
    error.loc !== null &&
    "line" in error.loc &&
    typeof error.loc.line === "number" &&
    "column" in error.loc &&
    typeof error.loc.column === "number"
  ) {
    return { line: error.loc.line, column: error.loc.column + 1 };
  }
  return {};
}

function isNetworkMemberCall(node: Node): boolean {
  if (node.type !== "MemberExpression" || node.object.type !== "Identifier") {
    return false;
  }
  const member =
    node.computed && node.property.type === "StringLiteral"
      ? node.property.value
      : node.property.type === "Identifier"
        ? node.property.name
        : "";
  switch (node.object.name) {
    case "axios":
      return true;
    case "XMLHttpRequest":
      return member === "open" || member === "send";
    case "navigator":
      return member === "sendBeacon";
    case "window":
    case "globalThis":
      return (
        member === "fetch" ||
        member === "XMLHttpRequest" ||
        member === "WebSocket"
      );
    default:
      return false;
  }
}

export function auditJavaScriptSource(source: string): StaticAuditResult {
  const findings: AuditFinding[] = [];
  const addFinding = (
    node: Node,
    code: AuditFindingCode,
    message: string,
  ) => findings.push({ code, message, ...locationOf(node) });

  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      plugins: ["jsx"],
    });
  } catch (error) {
    findings.push({
      code: "syntax-error",
      message:
        error instanceof Error
          ? error.message
          : "Source is not valid JavaScript or JSX.",
      ...parseErrorLocation(error),
    });
    return { analysisType: "static-only", syntaxValid: false, findings };
  }

  traverse(ast, {
    ImportDeclaration(path) {
      addFinding(
        path.node,
        "import",
        "Imports are not allowed in audited UI source.",
      );
    },
    ImportExpression(path) {
      addFinding(
        path.node,
        "import",
        "Dynamic imports are not allowed in audited UI source.",
      );
    },
    ReferencedIdentifier(path) {
      if (
        SUSPICIOUS_GLOBALS.has(path.node.name) &&
        !path.scope.hasBinding(path.node.name)
      ) {
        addFinding(
          path.node,
          "unapproved-global",
          `Use of unapproved global "${path.node.name}".`,
        );
      }
    },
    CallExpression(path) {
      const { callee } = path.node;
      if (
        callee.type === "Identifier" &&
        callee.name === "eval"
      ) {
        addFinding(
          path.node,
          "dynamic-evaluation",
          "Dynamic evaluation with eval() is not allowed.",
        );
      }
      if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "globalThis" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "eval"
      ) {
        addFinding(
          path.node,
          "dynamic-evaluation",
          "Dynamic evaluation through globalThis.eval() is not allowed.",
        );
      }
      if (
        (callee.type === "Identifier" && callee.name === "fetch") ||
        isNetworkMemberCall(callee)
      ) {
        addFinding(
          path.node,
          "network-call",
          "Network-capable calls are not allowed in audited UI source.",
        );
      }
    },
    NewExpression(path) {
      if (
        path.node.callee.type === "Identifier" &&
        path.node.callee.name === "Function"
      ) {
        addFinding(
          path.node,
          "dynamic-evaluation",
          "Dynamic evaluation with new Function() is not allowed.",
        );
      }
      if (
        path.node.callee.type === "Identifier" &&
        ["XMLHttpRequest", "WebSocket"].includes(path.node.callee.name)
      ) {
        addFinding(
          path.node,
          "network-call",
          "Network-capable constructors are not allowed in audited UI source.",
        );
      }
    },
    JSXOpeningElement(path) {
      const { name } = path.node;
      if (
        name.type === "JSXIdentifier" &&
        SUSPICIOUS_JSX_TAGS.has(name.name)
      ) {
        addFinding(
          path.node,
          "suspicious-jsx",
          `The <${name.name}> element is not allowed in audited UI source.`,
        );
      }
    },
    JSXAttribute(path) {
      const { name, value } = path.node;
      if (name.type !== "JSXIdentifier") {
        return;
      }
      const suspicious =
        name.name === "dangerouslySetInnerHTML" ||
        name.name === "srcDoc" ||
        name.name.toLowerCase().startsWith("on") ||
        ((name.name === "href" || name.name === "src") &&
          value?.type === "StringLiteral" &&
          value.value.trim().toLowerCase().startsWith("javascript:"));
      if (suspicious) {
        addFinding(
          path.node,
          "suspicious-jsx",
          `The "${name.name}" JSX attribute requires review.`,
        );
      }
    },
  });

  return { analysisType: "static-only", syntaxValid: true, findings };
}

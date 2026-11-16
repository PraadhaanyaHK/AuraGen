import { describe, expect, it } from "vitest";
import { auditJavaScriptSource } from "../server/audit.js";
import {
  malformedSource,
  safeSource,
  suspiciousSource,
} from "./fixtures/auditSources.js";
import { malformedPlans } from "./fixtures/malformedPlans.js";
import { validateAdaptiveUiPlan } from "../src/contracts.js";

describe("Babel static source audit", () => {
  it("labels analysis static-only and accepts a safe JavaScript/JSX fixture", () => {
    const result = auditJavaScriptSource(safeSource);
    expect(result.analysisType).toBe("static-only");
    expect(result.syntaxValid).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("reports selected suspicious constructs without executing source", () => {
    const result = auditJavaScriptSource(suspiciousSource);
    const codes = result.findings.map(({ code }) => code);
    expect(result.analysisType).toBe("static-only");
    expect(result.syntaxValid).toBe(true);
    expect(codes).toContain("import");
    expect(codes).toContain("dynamic-evaluation");
    expect(codes).toContain("unapproved-global");
    expect(codes).toContain("network-call");
    expect(codes).toContain("suspicious-jsx");
  });

  it("reports parser errors as static-analysis findings", () => {
    const result = auditJavaScriptSource(malformedSource);
    expect(result.syntaxValid).toBe(false);
    expect(result.findings[0]?.code).toBe("syntax-error");
    expect(result.findings[0]?.line).toBeGreaterThan(0);
  });
});

describe("malformed adaptive plan fixtures", () => {
  it("rejects plans with duplicate or missing fields and extra properties", () => {
    for (const plan of Object.values(malformedPlans)) {
      expect(() => validateAdaptiveUiPlan(plan)).toThrow();
    }
  });
});

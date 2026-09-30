import { describe, expect, it } from "vitest";
import { PYODIDE_VERSION, pyodideBaseCandidates } from "./pyodideRuntime";

describe("pyodideBaseCandidates", () => {
  it("tries public CDNs before the vendored fallback", () => {
    const bases = pyodideBaseCandidates("/app/", "lab.example.cn");
    expect(bases).toHaveLength(4);
    expect(bases[0]).toBe(`https://cdn.npmmirror.com/packages/pyodide/${PYODIDE_VERSION}/files/`);
    expect(bases[1]).toBe(`https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`);
    expect(bases[2]).toBe(`https://unpkg.com/pyodide@${PYODIDE_VERSION}/`);
    expect(bases[3]).toBe(`/app/vendor/pyodide-${PYODIDE_VERSION}/`);
  });

  it("serves only the vendored copy on loopback hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      expect(pyodideBaseCandidates("/", host)).toEqual([`/vendor/pyodide-${PYODIDE_VERSION}/`]);
    }
  });

  it("pins every candidate to the installed pyodide version", () => {
    for (const base of pyodideBaseCandidates("/", "lab.example.cn")) {
      expect(base).toContain(PYODIDE_VERSION);
    }
  });
});

import { describe, expect, it } from "vitest";
import { normalizeBasePath } from "./router";

describe("runtime base path normalization", () => {
  it.each([
    ["", "/"],
    ["/", "/"],
    ["/computing-lab", "/computing-lab"],
    ["/computing-lab/", "/computing-lab"],
    ["/computing-lab/?scenario=demo", "/computing-lab"],
    ["/computing-lab/#section", "/computing-lab"],
    ["///computing-lab///", "/computing-lab"],
  ])("normalizes %s to %s", (baseUrl, expected) => {
    expect(normalizeBasePath(baseUrl)).toBe(expected);
  });
});

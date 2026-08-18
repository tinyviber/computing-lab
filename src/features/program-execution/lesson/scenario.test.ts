import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRAM_EXECUTION_SCENARIO,
  parseProgramExecutionScenario,
  serializeProgramExecutionScenario,
} from "./scenario";

describe("program execution scenario", () => {
  it("hydrates canonical fixtures and uses the first repeated query value", () => {
    expect(parseProgramExecutionScenario("?fixture=off-by-one&fixture=zero-iterations")).toEqual({
      fixture: "off-by-one",
    });
    expect(parseProgramExecutionScenario({ fixture: "zero-iterations" })).toEqual({
      fixture: "zero-iterations",
    });
  });

  it("falls back safely for malformed, empty, unknown, and missing values", () => {
    expect(parseProgramExecutionScenario("?fixture=unknown")).toEqual(
      DEFAULT_PROGRAM_EXECUTION_SCENARIO,
    );
    expect(parseProgramExecutionScenario("?fixture=")).toEqual(DEFAULT_PROGRAM_EXECUTION_SCENARIO);
    expect(parseProgramExecutionScenario("?other=value")).toEqual(
      DEFAULT_PROGRAM_EXECUTION_SCENARIO,
    );
  });

  it("serializes only the feature-owned canonical fixture key", () => {
    expect(serializeProgramExecutionScenario({ fixture: "off-by-one" })).toBe("fixture=off-by-one");
    expect(serializeProgramExecutionScenario({ fixture: "not-a-fixture" as never })).toBe(
      "fixture=sum-1-to-3",
    );
  });
});

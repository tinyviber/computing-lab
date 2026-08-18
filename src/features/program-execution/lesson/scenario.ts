import type { ProgramId } from "../domain/model";

export type ProgramExecutionScenario = {
  fixture: ProgramId;
};

export type ProgramExecutionScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export const DEFAULT_PROGRAM_EXECUTION_SCENARIO: ProgramExecutionScenario = {
  fixture: "sum-1-to-3",
};

const fixtureIds: readonly ProgramId[] = ["sum-1-to-3", "zero-iterations", "off-by-one"];

function toParams(input: ProgramExecutionScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

function isProgramId(value: string | null): value is ProgramId {
  return value !== null && fixtureIds.includes(value as ProgramId);
}

export function parseProgramExecutionScenario(
  input: ProgramExecutionScenarioSearch,
): ProgramExecutionScenario {
  const params = toParams(input);
  const fixture = params.get("fixture");
  return { fixture: isProgramId(fixture) ? fixture : DEFAULT_PROGRAM_EXECUTION_SCENARIO.fixture };
}

export function serializeProgramExecutionScenario(scenario: ProgramExecutionScenario): string {
  const fixture = isProgramId(scenario.fixture)
    ? scenario.fixture
    : DEFAULT_PROGRAM_EXECUTION_SCENARIO.fixture;
  const params = new URLSearchParams();
  params.set("fixture", fixture);
  return params.toString();
}

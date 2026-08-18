export type MonteCarloScenarioId = "small" | "medium" | "large" | "same-n-different-seed";

export type MonteCarloScenario = {
  id: MonteCarloScenarioId;
  title: string;
  seed: number;
  samples: number;
  batchSize: number;
};

export type MonteCarloStatus = "running" | "complete";

export type MonteCarloMachine = {
  state: number;
  samplesDrawn: number;
  inside: number;
  status: MonteCarloStatus;
};

export type MonteCarloSnapshot = MonteCarloMachine;

export type MonteCarloFrame = {
  index: number;
  before: MonteCarloSnapshot;
  after: MonteCarloSnapshot;
  batch: number;
  sampleCount: number;
  insideCount: number;
  estimate: number;
  error: number;
};

export type MonteCarloStepResult = {
  machine: MonteCarloMachine;
  frame?: MonteCarloFrame;
  done: boolean;
};

export type MonteCarloComparisonRow = {
  id: MonteCarloScenarioId;
  title: string;
  seed: number;
  samples: number;
  estimate: number;
  error: number;
};

const STATE_MASK = 0xffffffff;
const SCALE = 65536;

function nextState(state: number): number {
  return (Math.imul(state, 1103515245) + 12345) & STATE_MASK;
}

function unitValue(state: number): number {
  return (state >>> 16) / SCALE;
}

export function nextSample(state: number): { state: number; x: number; y: number } {
  const xState = nextState(state);
  const x = unitValue(xState);
  const yState = nextState(xState);
  const y = unitValue(yState);
  return { state: yState, x, y };
}

export function assertMonteCarloScenario(scenario: MonteCarloScenario): void {
  if (!scenario.title.trim()) throw new Error("Monte Carlo scenarios need a title.");
  if (!Number.isSafeInteger(scenario.seed) || scenario.seed < 0) {
    throw new Error(`Invalid Monte Carlo seed: ${scenario.seed}.`);
  }
  if (!Number.isSafeInteger(scenario.samples) || scenario.samples <= 0) {
    throw new Error(`Invalid Monte Carlo sample count: ${scenario.samples}.`);
  }
  if (!Number.isSafeInteger(scenario.batchSize) || scenario.batchSize <= 0) {
    throw new Error(`Invalid Monte Carlo batch size: ${scenario.batchSize}.`);
  }
  if (scenario.samples % scenario.batchSize !== 0) {
    throw new Error("Monte Carlo sample count must be a whole number of batches.");
  }
}

function cloneMachine(machine: MonteCarloMachine): MonteCarloMachine {
  return { ...machine };
}

function snapshot(machine: MonteCarloMachine): MonteCarloSnapshot {
  return cloneMachine(machine);
}

export function createMonteCarloMachine(scenario: MonteCarloScenario): MonteCarloMachine {
  assertMonteCarloScenario(scenario);
  return { state: scenario.seed, samplesDrawn: 0, inside: 0, status: "running" };
}

export function stepMonteCarlo(
  machine: MonteCarloMachine,
  scenario: MonteCarloScenario,
): MonteCarloStepResult {
  assertMonteCarloScenario(scenario);
  if (machine.status === "complete") return { machine, done: true };

  let state = machine.state;
  let batchInside = 0;
  for (let index = 0; index < scenario.batchSize; index += 1) {
    const sample = nextSample(state);
    state = sample.state;
    if (sample.x * sample.x + sample.y * sample.y <= 1) batchInside += 1;
  }

  const samplesDrawn = machine.samplesDrawn + scenario.batchSize;
  const inside = machine.inside + batchInside;
  const next: MonteCarloMachine = {
    state,
    samplesDrawn,
    inside,
    status: samplesDrawn >= scenario.samples ? "complete" : "running",
  };

  const before = snapshot(machine);
  const after = snapshot(next);
  const estimate = (4 * inside) / samplesDrawn;
  return {
    machine: next,
    frame: {
      index: machine.samplesDrawn / scenario.batchSize,
      before,
      after,
      batch: samplesDrawn / scenario.batchSize,
      sampleCount: samplesDrawn,
      insideCount: inside,
      estimate,
      error: Math.abs(estimate - Math.PI),
    },
    done: next.status === "complete",
  };
}

export function runMonteCarlo(scenario: MonteCarloScenario): {
  machine: MonteCarloMachine;
  frames: MonteCarloFrame[];
} {
  let machine = createMonteCarloMachine(scenario);
  const frames: MonteCarloFrame[] = [];
  const batches = scenario.samples / scenario.batchSize;
  for (let index = 0; index < batches; index += 1) {
    const result = stepMonteCarlo(machine, scenario);
    if (!result.frame) throw new Error("A running Monte Carlo step must produce a frame.");
    frames.push(result.frame);
    machine = result.machine;
  }
  return { machine, frames };
}

export function monteCarloComparison(
  scenarios: readonly MonteCarloScenario[],
): MonteCarloComparisonRow[] {
  return scenarios
    .map((scenario) => {
      const { machine } = runMonteCarlo(scenario);
      const estimate = (4 * machine.inside) / machine.samplesDrawn;
      return {
        id: scenario.id,
        title: scenario.title,
        seed: scenario.seed,
        samples: scenario.samples,
        estimate,
        error: Math.abs(estimate - Math.PI),
      };
    })
    .sort((a, b) => a.samples - b.samples);
}

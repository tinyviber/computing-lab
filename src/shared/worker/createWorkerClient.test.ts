import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerClient, WORKER_LOAD_TIMEOUT_MS } from "./createWorkerClient.ts";
import { PYODIDE_LOAD_TIMEOUT_MESSAGE, PYODIDE_RUN_TIMEOUT_MESSAGE } from "./workerErrors.ts";

type Message = Record<string, unknown> & { id: number };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  posted: Message[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: Message) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const spawn = () => new FakeWorker() as unknown as Worker;

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createWorkerClient", () => {
  it("resolves with the ok-payload fields, stripped of the envelope", async () => {
    const client = createWorkerClient(spawn);
    const run = client.run<{ results: number[] }>({ kind: "cell", code: "x" });
    const worker = FakeWorker.instances[0];
    expect(worker.posted[0]).toMatchObject({ id: 1, kind: "cell", code: "x" });
    worker.emit({ id: 1, phase: "executing" });
    worker.emit({ id: 1, ok: true, results: [1, 2], helperFailed: true });
    await expect(run).resolves.toEqual({ results: [1, 2], helperFailed: true });
  });

  it("rejects with the worker's error string", async () => {
    const client = createWorkerClient(spawn);
    const run = client.run({ code: "x" });
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    FakeWorker.instances[0].emit({ id: 1, ok: false, error: "需要一个函数 decode" });
    await expect(run).rejects.toThrow("需要一个函数 decode");
  });

  it("switches from the load budget to timeoutMs on the executing ack", async () => {
    const client = createWorkerClient(spawn);
    const run = client.run({ code: "x" }, 5000);
    vi.advanceTimersByTime(WORKER_LOAD_TIMEOUT_MS - 1);
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    // Load budget is gone; the run now has its own 5 s budget.
    vi.advanceTimersByTime(4999);
    expect(FakeWorker.instances[0].terminated).toBe(false);
    FakeWorker.instances[0].emit({ id: 1, ok: true, result: 1 });
    await expect(run).resolves.toEqual({ result: 1 });
  });

  it("a load timeout rejects the request but keeps the worker alive", async () => {
    const client = createWorkerClient(spawn);
    const run = client.run({ code: "x" });
    vi.advanceTimersByTime(WORKER_LOAD_TIMEOUT_MS);
    await expect(run).rejects.toThrow(PYODIDE_LOAD_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(false);
  });

  it("an executing timeout kills the worker and rejects everything pending", async () => {
    const client = createWorkerClient(spawn);
    const runA = client.run({ code: "a" });
    const runB = client.run({ code: "b" });
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    // id 2 still in its load phase — killing rejects it too.
    vi.advanceTimersByTime(15_000);
    await expect(runA).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    await expect(runB).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    // Next run spawns a fresh worker.
    const next = client.run({ code: "c" });
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].emit({ id: 3, ok: true, result: 9 });
    await expect(next).resolves.toEqual({ result: 9 });
  });

  it("an onerror kills the worker and rejects pending runs", async () => {
    const client = createWorkerClient(spawn);
    const run = client.run({ code: "x" });
    FakeWorker.instances[0].onerror?.();
    await expect(run).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });
});

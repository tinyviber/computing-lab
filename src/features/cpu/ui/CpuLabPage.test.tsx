import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CpuJudgeResult } from "../domain/protocol.ts";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";

/** Answer the currently-asking prompt. Options render shuffled; a wrong
 * pick only flags `.is-wrong` on that option (single-slot wrongPick — the
 * flag is lost when another wrong option is picked), so we click options
 * by index until the asking question's text changes. */
async function answerNextPrompt(user: ReturnType<typeof userEvent.setup>) {
  // Retry whole passes: a click during an in-flight POST leaves every option
  // disabled for a moment, so a skipped index must be retried later rather
  // than abandoned.
  for (let pass = 0; pass < 10; pass += 1) {
    const item = document.querySelector(".cpu-guide-item.is-next");
    if (!item) return;
    const promptText = item.querySelector(".cpu-guide-prompt")?.textContent ?? "";
    const options = item.querySelectorAll<HTMLButtonElement>(".cpu-guide-option");
    for (let i = 0; i < options.length; i += 1) {
      const fresh = document.querySelector(".cpu-guide-item.is-next");
      if (!fresh) return;
      if (fresh.querySelector(".cpu-guide-prompt")?.textContent !== promptText) return;
      const opt = fresh.querySelectorAll<HTMLButtonElement>(".cpu-guide-option")[i];
      if (!opt) continue;
      if (opt.disabled) {
        // A previous answer's POST is in flight — wait for buttons to re-enable.
        const enabled = await waitFor(() => !opt.disabled, { timeout: 800 }).catch(() => false);
        if (!enabled) continue;
      }
      await user.click(opt);
      const advanced = await waitFor(
        () =>
          document.querySelector(".cpu-guide-item.is-next .cpu-guide-prompt")?.textContent !==
          promptText,
        { timeout: 800 },
      ).catch(() => false);
      if (advanced) return;
    }
  }
}

/** The M1 program is fixed (LOAD→STORE→HALT, 4 cycles). The stepper is
 * blocked behind `at` prompts — answer the asking one, else beat, until the
 * run halts. */
async function walkCurrentCaseToEnd(user: ReturnType<typeof userEvent.setup>) {
  for (let guard = 0; guard < 80 && screen.queryByText(/结束：/) === null; guard += 1) {
    if (document.querySelector(".cpu-guide-item.is-next")) {
      await answerNextPrompt(user);
      continue;
    }
    const step = screen.queryByRole("button", { name: /下一拍|提交这一周期/ });
    if (!step || step.hasAttribute("disabled")) break;
    await user.click(step);
  }
}

/** A fetch stub that serves the project GET and guided answers. */
function stubApi(project: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/guided-answer")) {
        return new Response(JSON.stringify({ optionIndex: 0 }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ currentStage: 1, passedStages: [], drafts: {}, ...project }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
}

/** The live cycle counter, e.g. `周期 1` or `周期 4 / 4` once finished. */
function cycleCount(): string {
  return document.querySelector(".cpu-cycle-count")?.textContent ?? "";
}

/** Rows rendered inside the 执行轨迹 table (the header row always counts). */
function traceRowCount(): number {
  const trace = screen.getByRole("heading", { name: "执行轨迹" }).closest("section")!;
  return within(trace).getAllByRole("row").length;
}

/** Click options of the asking prompt until one is correct. Works under
 * fake timers: each pick is flushed with `act` instead of `waitFor`. */
async function answerAskingPrompt(): Promise<boolean> {
  for (let pass = 0; pass < 10; pass += 1) {
    const item = document.querySelector(".cpu-guide-item.is-next");
    if (!item) return false;
    const promptText = item.querySelector(".cpu-guide-prompt")?.textContent ?? "";
    const options = [...item.querySelectorAll<HTMLButtonElement>(".cpu-guide-option")];
    let clicked = false;
    for (const opt of options) {
      if (opt.disabled) continue;
      fireEvent.click(opt);
      clicked = true;
      await act(async () => {});
      const now = document.querySelector(".cpu-guide-item.is-next .cpu-guide-prompt")?.textContent;
      if (now !== promptText) return true;
    }
    if (!clicked) await act(async () => {});
  }
  return false;
}

describe("CpuLabPage", () => {
  it("mounts the guided workspace: rail, shelf, prompts, locked editor, machine view", async () => {
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge groups.
    expect(await screen.findByRole("heading", { name: /按一下时钟/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 1 关后")).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 2 关后")).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 3 关后")).toBeInTheDocument();

    // The instruction shelf is persistent, and the guided checklist asks.
    expect(screen.getByRole("heading", { name: "指令卡片" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "先看懂，再预测" })).toBeInTheDocument();

    // Guided stage 1 locks every row — no selects, just fixed mnemonics.
    const programSection = screen.getByRole("heading", { name: "程序" }).closest("section")!;
    expect(within(programSection).getAllByText("LOAD A, M[14]").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: /第 0 行指令/ })).not.toBeInTheDocument();

    // The machine view: registers, memory grid, diagram, trace — clock idle.
    expect(screen.getByRole("button", { name: "下一拍" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "寄存器" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /存储器/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /数据通路/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "执行轨迹" })).toBeInTheDocument();

    // Trace no-spoiler (issue #100): before a single beat is walked, the end
    // row and the total-cycle reason must not give the run's ending away.
    expect(screen.queryByText(/结束：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 个周期/)).not.toBeInTheDocument();

    // Submit stays gated until the prompt sequence completes.
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeDisabled();
  });

  it("keeps 提交判定 gated until every public case has been walked to HALT (issue #100 review)", async () => {
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: /按一下时钟/ });

    // Observation gate: a zero-programming core stage cannot be submitted
    // before the demos are watched to the end — the point of the mainline is
    // watching the parts move, not just answering prompts.
    const submit = screen.getByRole("button", { name: "提交判定" });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/已看 0 \/ \d+ 份/)).toBeInTheDocument();
    expect(submit).toHaveAttribute("title", expect.stringContaining("按时钟走到停机"));
  });

  it(
    "does not leak case A's walk-through into case B on a demo-data switch (issue #100 review)",
    { timeout: 20000 },
    async () => {
      stubApi();
      const user = userEvent.setup();
      await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });
      await screen.findByRole("heading", { name: /按一下时钟/ });

      // Walk case A to HALT — fills its trace + marks A observed.
      await walkCurrentCaseToEnd(user);
      expect(await screen.findByText(/结束：/)).toBeInTheDocument();
      expect(screen.getByText(/已看 1 \/ 2 份/)).toBeInTheDocument();

      // Switch to case B — the new run must start from cycle 0, NOT inherit
      // A's finished position (the old cursor+effect reset raced: B got
      // pre-marked observed and its whole trace flashed before stepping).
      const picker = screen.getByRole("combobox", { name: /演示数据/ });
      await user.selectOptions(picker, "1");

      // B renders its own walk from 0: no trace rows walked, no end row, and
      // the observation record still only counts A.
      expect(screen.queryByText(/结束：/)).not.toBeInTheDocument();
      expect(screen.getByText(/已看 1 \/ 2 份/)).toBeInTheDocument();
      const trace = screen.getByRole("heading", { name: "执行轨迹" }).closest("section")!;
      // Only the header row — no cycle rows committed for B yet.
      expect(within(trace).getAllByRole("row")).toHaveLength(1);
      // The clock went back to idle on the switch — a leftover "paused"
      // would mislabel this button as 「继续」 for a run that never walked.
      expect(screen.getByRole("button", { name: "连跑" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "继续" })).not.toBeInTheDocument();
    },
  );

  it("restarts the walk on ANY program edit — even back to the same text (issue #100 review)", async () => {
    // Program-keyed playback used to resurrect the old run on A→B→A: the
    // same content hash produced the same view slot. Draft edits now bump
    // an editRevision instead, so every edit starts a fresh walk.
    stubApi({
      currentStage: 7,
      passedStages: [1, 2, 3, 4, 5, 6],
      drafts: {
        "7": {
          rows: [
            { op: "LOAD", reg: 0, operand: 13 },
            { op: "HALT", reg: 0, operand: 0 },
          ],
        },
      },
    });
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: /真正写一个 if/ });

    const step = () => screen.getByRole("button", { name: /下一拍|提交这一周期/ });
    fireEvent.click(step());
    fireEvent.click(step());
    fireEvent.click(step());
    expect(cycleCount()).toBe("周期 1");

    // A→B: an edit is a new playback identity — the walk restarts.
    const opSelect = screen.getByRole("combobox", { name: "第 0 行指令" });
    fireEvent.change(opSelect, { target: { value: "STORE" } });
    expect(cycleCount()).toBe("周期 0");

    // B→A: identical program text — a content-keyed cache would bring the
    // old 周期 1 back here. With editRevision it stays at zero.
    fireEvent.change(opSelect, { target: { value: "LOAD" } });
    expect(cycleCount()).toBe("周期 0");
  });

  it("shows stage takeaway when the stage is passed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 1,
              passedStages: [1],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: /按一下时钟/ });
    expect(screen.getByText(/本关收获/)).toBeInTheDocument();
  });

  it("does not show stage takeaway when the stage is not passed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 1,
              passedStages: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: /按一下时钟/ });
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();
  });

  it(
    "auto-play commits exactly once per cycle under StrictMode (issue #100 review)",
    { timeout: 20000 },
    async () => {
      // M3's fixed program (LOAD→ADD→STORE→HALT, 4 cycles) auto-plays
      // beat-by-beat at 350ms. The old code called setPlaybackViews from
      // INSIDE a phase updater — a nested same-state update that a
      // StrictMode double-invoke could run twice, committing 2 cycles per
      // exec beat.
      stubApi({ currentStage: 3, passedStages: [1, 2] });
      await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState, strict: true });
      await screen.findByRole("heading", { name: /上一章藏在这里/ });
      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByRole("button", { name: "连跑" }));
        await act(async () => {
          vi.advanceTimersByTime(350 * 3); // fetch → decode → exec|commit
        });
        // Exactly ONE cycle committed — a double-fired updater would land on 2.
        expect(cycleCount()).toBe("周期 1");

        // The at:1 prompts pause the clock; answer every prompt (carry-out
        // pins 演示数据 to the second case mid-way through).
        expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument();
        for (let i = 0; i < 5; i += 1) {
          expect(await answerAskingPrompt()).toBe(true);
        }

        // Case B's walk starts at zero — and still commits exactly once per
        // cycle, all the way to HALT. The pin reset the clock to idle, so the
        // button correctly reads 「连跑」, not 「继续」.
        fireEvent.click(screen.getByRole("button", { name: "连跑" }));
        await act(async () => {
          vi.advanceTimersByTime(350 * 3);
        });
        expect(cycleCount()).toBe("周期 1");
        await act(async () => {
          vi.advanceTimersByTime(350 * 9); // cycles 2–4, no prompts left to block
        });
        expect(cycleCount()).toBe("周期 4 / 4");
        expect(screen.getByText(/结束：/)).toBeInTheDocument();
        // Observation is recorded from committed state — case B counts.
        expect(screen.getByText(/已看 1 \/ 2 份/)).toBeInTheDocument();
      } finally {
        // Never leak fake timers into the rest of the suite.
        vi.useRealTimers();
      }
    },
  );

  it("restarts the walk when switching between free-authoring stages (issue #100 review)", async () => {
    // X1/X2 both start with an EMPTY program — without a stage component in
    // the playback key their first cases collided (`0-p-`), leaking the
    // walked position across the stage switch.
    stubApi({ currentStage: 7, passedStages: [1, 2, 3, 4, 5, 6] });
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: /真正写一个 if/ });

    // The empty program still executes memory — step one full cycle in.
    const step = () => screen.getByRole("button", { name: /下一拍|提交这一周期/ });
    fireEvent.click(step());
    fireEvent.click(step());
    fireEvent.click(step());
    expect(cycleCount()).toBe("周期 1");

    // Stage 8 is a different playback identity — its walk starts at zero.
    fireEvent.click(screen.getByRole("button", { name: /用循环合成/ }));
    await screen.findByRole("heading", { name: /用循环合成/ });
    expect(cycleCount()).toBe("周期 0");
    expect(traceRowCount()).toBe(1); // header only — nothing walked yet
    expect(screen.queryByText(/结束：/)).not.toBeInTheDocument();
  });

  it("a second replayed counterexample starts its own walk (issue #100 review)", async () => {
    const judgeFor = (name: string, initMem: Record<number, number>): CpuJudgeResult => ({
      score: 0,
      total: 1,
      passed: false,
      testSummary: {
        categories: { basic: { passed: 0, total: 1 } },
        results: [{ name, category: "basic", passed: false }],
        counterexample: {
          name,
          category: "basic",
          reason: null,
          cyclesUsed: 2,
          cycleBudget: 9,
          initMem,
          memDiff: [{ addr: 15, expected: 1, actual: 0 }],
          regDiff: [],
          trace: [],
          finalRegs: { A: 0, B: 0 },
          selfModFetch: false,
        },
        branchOneWayOnly: false,
        error: null,
      },
      submissionId: `sub-${name}`,
      currentStage: 7,
      passedStages: [1, 2, 3, 4, 5, 6],
      unlockedComponent: null,
    });
    const outcomes = [judgeFor("数据甲", { 13: 0, 14: 0 }), judgeFor("数据乙", { 13: 9, 14: 9 })];
    let judgeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/judge")) {
          const outcome = outcomes[Math.min(judgeCalls, outcomes.length - 1)];
          judgeCalls += 1;
          return new Response(JSON.stringify(outcome), {
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            currentStage: 7,
            passedStages: [1, 2, 3, 4, 5, 6],
            drafts: {
              "7": {
                rows: [
                  { op: "LOAD", reg: 0, operand: 13 },
                  { op: "HALT", reg: 0, operand: 0 },
                ],
              },
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: /真正写一个 if/ });

    // Replay the first counterexample into the machine view and walk a cycle.
    fireEvent.click(screen.getByRole("button", { name: "提交判定" }));
    await screen.findByText(/反例 数据甲/);
    fireEvent.click(screen.getByRole("button", { name: /把这份数据装进机器视图/ }));
    const step = () => screen.getByRole("button", { name: /下一拍|提交这一周期/ });
    fireEvent.click(step());
    fireEvent.click(step());
    fireEvent.click(step());
    expect(cycleCount()).toBe("周期 1");

    // A DIFFERENT counterexample is a different playback identity — it must
    // not inherit the first replay's position.
    fireEvent.click(screen.getByRole("button", { name: "提交判定" }));
    await screen.findByText(/反例 数据乙/);
    fireEvent.click(screen.getByRole("button", { name: /把这份数据装进机器视图/ }));
    expect(cycleCount()).toBe("周期 0");
    expect(traceRowCount()).toBe(1);
  });
});

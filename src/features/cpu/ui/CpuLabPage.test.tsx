import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/guided-answer")) {
        return new Response(JSON.stringify({ optionIndex: 0 }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ currentStage: 1, passedStages: [], drafts: {} }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
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
    },
  );

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
});

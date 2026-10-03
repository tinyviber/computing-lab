import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";
import type { IsJudgeResult } from "../domain/protocol.ts";
import { getIsStage } from "../domain/stages.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FLAGGED = /判定反例涉及此设备/;

/** A failed verdict whose counterexample names stage 1's 书目库 (id `books`). */
const failedJudge: IsJudgeResult = {
  score: 0,
  total: 1,
  passed: false,
  testSummary: {
    categories: { 借阅: { passed: 0, total: 1 } },
    results: [{ name: "隐藏-1", category: "借阅", passed: false }],
    counterexample: {
      name: "隐藏-1",
      category: "借阅",
      reason: null,
      eventsUsed: 0,
      eventBudget: 10,
      scenario: {
        name: "隐藏-1",
        category: "借阅",
        horizon: 10,
        script: [],
        expect: { events: 10 },
      },
      dbDiff: [{ node: "books", expectedCount: 2, actualCount: 0 }],
      seenDiff: [],
      firedDiff: [],
      unapproved: [],
      pending: [],
      dropped: [],
      trace: [],
    },
    error: null,
  },
  submissionId: "s1",
  currentStage: 1,
  passedStages: [],
  unlockedComponent: null,
};

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
}

/**
 * Stage 1 loads as a saved draft with the scanner already wired; the judge
 * POST answers through `judge`. Waiting on the wire makes sure the project
 * load has landed — a late load would clear the verdict under test.
 */
async function openWiredStage1(judge: () => Promise<Response>) {
  const prefill = getIsStage(1)!.prefill;
  const wired = { ...prefill, links: [{ from: "scan", to: "books", port: "write" }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/judge")) return judge();
      if (url.endsWith("/project")) {
        return json({ currentStage: 1, passedStages: [], drafts: { 1: wired } });
      }
      return json({ labs: [] });
    }),
  );
  await renderAppAt("/classes/c1/labs/is-sim", { auth: teacherAuthState });
  await screen.findByRole("button", { name: "写入 ← scan" });
}

describe("IsLabPage", () => {
  it("mounts the workspace: rail, canvas, inspector, and the timeline player", async () => {
    await renderAppAt("/classes/c1/labs/is-sim", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge branch.
    expect(await screen.findByRole("heading", { name: /让数据流起来/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 5 关后")).toBeInTheDocument();

    // The canvas is prefilled with the stage-1 scaffold (扫码枪 + 书目库)
    // and the palette is gated to the stage's device list.
    expect(screen.getByText("扫码枪")).toBeInTheDocument();
    expect(screen.getByText("书目库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋ 采集点" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "＋ 人工位" })).not.toBeInTheDocument();

    // The player: step/run/reset, case picker, empty timeline — clock idle.
    expect(screen.getByRole("button", { name: "单步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "连跑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复位" })).toBeInTheDocument();
    expect(screen.getByLabelText("演示场景")).toBeInTheDocument();

    // Submit and public-test controls render (the lab works offline too).
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeInTheDocument();
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

    await renderAppAt("/classes/c1/labs/is-sim", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: /让数据流起来/ });
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

    await renderAppAt("/classes/c1/labs/is-sim", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: /让数据流起来/ });
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();
  });

  it("marks the devices a failed judgement names until the topology changes", async () => {
    await openWiredStage1(async () => json(failedJudge));

    fireEvent.click(screen.getByRole("button", { name: "提交判定" }));

    const books = await screen.findByRole("button", { name: "数据库 书目库，判定反例涉及此设备" });
    expect(books).toHaveClass("is-flagged");
    expect(screen.getByRole("button", { name: "采集点 扫码枪" })).not.toHaveClass("is-flagged");

    fireEvent.click(screen.getByRole("button", { name: "＋ 采集点" }));

    expect(screen.queryByRole("button", { name: FLAGGED })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "数据库 书目库" })).not.toHaveClass("is-flagged");
  });

  it("does not mark devices for a verdict on a topology edited while judging", async () => {
    let answer: (response: Response) => void = () => {};
    await openWiredStage1(() => new Promise<Response>((resolve) => (answer = resolve)));

    fireEvent.click(screen.getByRole("button", { name: "提交判定" }));
    expect(screen.getByRole("button", { name: "判定中…" })).toBeDisabled();
    // The canvas stays editable while the judge runs.
    fireEvent.click(screen.getByRole("button", { name: "＋ 采集点" }));
    await act(async () => answer(json(failedJudge)));

    // The verdict still lands, but it graded the topology from before the edit.
    expect(await screen.findByText(/设备 books 应有 2 条记录/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FLAGGED })).not.toBeInTheDocument();
  });
});

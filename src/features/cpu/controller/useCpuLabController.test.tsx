import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCpuStage } from "../domain/stages.ts";
import { useCpuLabController } from "./useCpuLabController.ts";

afterEach(() => vi.unstubAllGlobals());

const context = { classId: "c1", ready: false, userId: "preview-test" };

describe("CPU controller boundary", () => {
  it("refuses premature submission and locked stage selection through the action contract", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useCpuLabController(context));
    await act(async () => {
      await result.current.actions.submit();
    });
    act(() => result.current.actions.selectStage(3));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.model.stage?.index).toBe(1);
    expect(result.current.model.submission.canSubmit).toBe(false);
  });

  it("keeps a prediction pending when recording fails, then accepts the same original option on retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(
        new Response(JSON.stringify({ optionIndex: 0 }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useCpuLabController(context));
    const prompt = getCpuStage(1)!.guided!.prompts[0];
    const correct = prompt.options.findIndex((o) => o.correct);
    await act(async () => {
      await result.current.actions.answerPrompt(prompt.id, correct);
    });
    expect(result.current.model.guide?.answeredCount).toBe(0);
    expect(result.current.model.feedback.error).toContain("记录预测失败");
    await act(async () => {
      await result.current.actions.answerPrompt(prompt.id, correct);
    });
    expect(result.current.model.guide?.answeredCount).toBe(1);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      stageIndex: 1,
      promptId: prompt.id,
      optionIndex: correct,
    });
  });

  it("keeps running program edits out of lesson state and rejects invalid case/scrub requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
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
              calculatorCoreComplete: true,
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const { result } = renderHook(() => useCpuLabController({ ...context, ready: true }));
    await waitFor(() => expect(result.current.model.stage?.index).toBe(7));
    act(() => {
      result.current.actions.selectCase(Number.NaN);
      result.current.actions.scrubTo(99);
      result.current.actions.run();
    });
    const rows = result.current.model.editor.rows;
    act(() => {
      result.current.actions.setRow(0, { op: "STORE" });
      result.current.actions.insertRow(1);
      result.current.actions.removeRow(0);
      result.current.actions.moveRow(0, 1);
    });
    expect(result.current.model.editor.rows).toEqual(rows);
    expect(result.current.model.machine?.cursor).toBe(0);
    act(() => result.current.actions.pause());
  });
});

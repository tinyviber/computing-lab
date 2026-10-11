import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../test/router-test-helpers";
import type { AuthState } from "../../shared/auth";

const studentAuth: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20260101", name: "学生", role: "user" },
    memberships: [{ classId: "c1", className: "一班", role: "student" }],
  },
};

describe("HomePage lab visibility", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not show the audio demo card until its catalog entry is open", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/api/labs")
        ? {
            labs: [
              {
                id: "audio-encoding",
                stageCount: 0,
                hidden: true,
                openClassIds: null,
                visible: false,
                visibleClassIds: [],
              },
            ],
          }
        : path.includes("/task-assignments")
          ? { assignments: [] }
          : { currentStage: 1 };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/", { auth: studentAuth });

    expect(await screen.findByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "声音编码（演示）" })).not.toBeInTheDocument();
  });
});

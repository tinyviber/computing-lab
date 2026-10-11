import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../test/router-test-helpers";
import type { AuthState } from "../../shared/auth";

const multiClassTeacher: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [
      { classId: "c11", className: "2026-高二信息技术-11", role: "teacher" },
      { classId: "c12", className: "2026-高二信息技术-12", role: "teacher" },
    ],
  },
};

describe("TeacherDashboardPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets a teacher switch between class dashboards", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ classId: "c11", className: "2026-高二信息技术-11", rows: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { history } = await renderAppAt("/classes/c11/dashboard", { auth: multiClassTeacher });
    expect(screen.getByRole("combobox", { name: "选择班级" })).toHaveValue("c11");
    expect(screen.getByRole("option", { name: "2026-高二信息技术-12" })).toBeInTheDocument();
    expect(screen.getByLabelText("学生进度横向滚动区")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "选择班级" }), "c12");
    await waitFor(() => expect(history.location.pathname).toBe("/classes/c12/dashboard"));
  });

  it("renders decoding parts in the failure drawer and shows recorded CPU predictions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/sub-1")
        ? {
            id: "sub-1",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 1,
            score: 0,
            total: 1,
            passed: false,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              parts: [
                {
                  id: "text",
                  label: "解码出的文本",
                  ok: false,
                  detail: "第 1 个字符不符",
                },
              ],
              predictions: [
                {
                  promptId: "first-fetch",
                  prompt: "机器从哪一格取指？",
                  selected: "第 14 格",
                  correct: false,
                },
              ],
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=decoding")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 1,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 0,
                      total: 1,
                      passed: false,
                      submissionId: "sub-1",
                      submittedAt: "2026-10-11T00:00:00.000Z",
                    },
                  },
                  lastActiveAt: null,
                },
              ],
            }
          : { labs: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/classes/c11/dashboard?lab=decoding", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByRole("button", { name: "0/1" }));

    expect(await screen.findByText("解码出的文本")).toBeInTheDocument();
    expect(screen.getByText("第 1 个字符不符")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "预测首答" })).toHaveTextContent("第 14 格");
  });

  it("lets teachers inspect first predictions after a CPU stage passes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/cpu-sub")
        ? {
            id: "cpu-sub",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 1,
            score: 3,
            total: 3,
            passed: true,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              categories: { basic: { passed: 3, total: 3 } },
              predictions: [
                {
                  promptId: "first-fetch",
                  prompt: "机器从哪一格取指？",
                  selected: "第 14 格",
                  correct: false,
                },
              ],
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=cpu")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 2,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 3,
                      total: 3,
                      passed: true,
                      submissionId: "cpu-sub",
                      submittedAt: "2026-10-11T00:00:00.000Z",
                    },
                  },
                  lastActiveAt: null,
                },
              ],
            }
          : { labs: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/classes/c11/dashboard?lab=cpu", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByTitle("查看提交详情"));

    expect(await screen.findByRole("region", { name: "预测首答" })).toHaveTextContent("第 14 格");
  });
});

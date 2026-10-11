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
const noClassStudentAuth: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-no-class", studentNo: "20260102", name: "未入班学生", role: "user" },
    memberships: [],
  },
};

describe("AudioEncodingEntryPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("blocks direct access while the demo is hidden in the lab catalog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await renderAppAt("/labs/audio-encoding", { auth: studentAuth });

    expect(await screen.findByRole("heading", { name: "这个实验暂未开放" })).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "声音编码演示" })).not.toBeInTheDocument();
  });

  it("requires class membership even when the catalog is globally open", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          labs: [
            {
              id: "audio-encoding",
              stageCount: 0,
              hidden: false,
              openClassIds: null,
              visible: true,
              visibleClassIds: [],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await renderAppAt("/labs/audio-encoding", { auth: noClassStudentAuth });

    expect(await screen.findByRole("heading", { name: "这个实验暂未开放" })).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "声音编码演示" })).not.toBeInTheDocument();
  });
});

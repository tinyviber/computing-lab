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
    expect(screen.getByRole("navigation", { name: "班级切换" })).toBeInTheDocument();
    expect(
      screen.queryByText("2026-高二信息技术-11", {
        selector: ".dashboard-topbar > div:first-child .eyebrow",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-高二信息技术-12" })).toHaveAttribute(
      "href",
      "/classes/c12/dashboard",
    );

    await userEvent.click(screen.getByRole("link", { name: "2026-高二信息技术-12" }));
    await waitFor(() => expect(history.location.pathname).toBe("/classes/c12/dashboard"));
  });
});

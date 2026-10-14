import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../shared/auth";
import { anonymousAuthState, renderAppAt, teacherAuthState } from "../../test/router-test-helpers";

const membersPayload = {
  classId: "c1",
  className: "测试班级",
  students: [{ userId: "u-s1", studentNo: "20260101", name: "张三" }],
  teachers: [{ userId: "u-t1", studentNo: "teacher", name: "教师" }],
};

const studentAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-s1", studentNo: "20260101", name: "张三", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockMembersApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/classes/c1/members")) {
      if (method === "GET") return jsonResponse(membersPayload);
      if (method === "POST") return jsonResponse({ member: membersPayload.students[0] }, 201);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
}

describe("ClassMembersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the roster and enrolls an existing account by student number", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });

    expect(screen.getByRole("heading", { name: "班级成员" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());
    expect(screen.getByText(/任课教师：教师/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("学生学号"), "20260102");
    await user.click(screen.getByRole("button", { name: "加入班级" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ studentNo: "20260102" }),
        }),
      ),
    );
  });

  it("creates a new student account seated in the class", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());

    await user.type(screen.getByLabelText("学号"), "20260103");
    await user.type(screen.getByLabelText("姓名"), "李四");
    await user.type(screen.getByLabelText("初始密码"), "pw1234");
    await user.click(screen.getByRole("button", { name: "创建并入班" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members/students",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ studentNo: "20260103", name: "李四", password: "pw1234" }),
        }),
      ),
    );
  });

  it("removes a student after confirmation", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "移出班级" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("确定把学生「张三（20260101）」移出班级");
    await user.click(screen.getByRole("button", { name: "确认移出" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members/u-s1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("denies students", async () => {
    mockMembersApi();
    await renderAppAt("/classes/c1/members", { auth: studentAuthState });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "只有任课教师或管理员可以管理班级成员",
    );
  });

  it("redirects anonymous visitors to login", async () => {
    mockMembersApi();
    const { router } = await renderAppAt("/classes/c1/members", { auth: anonymousAuthState });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});

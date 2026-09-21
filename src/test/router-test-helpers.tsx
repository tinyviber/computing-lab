import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { AuthProvider, type AuthState } from "../shared/auth";
import { createAppRouter } from "../app/router";

/** Default harness identity for authenticated page tests. */
export const teacherAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const adminAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const anonymousAuthState: AuthState = { status: "anonymous", session: null };

export type RenderAppOptions = { auth?: AuthState };

export async function renderAppAt(initialEntry: string, options: RenderAppOptions = {}) {
  const auth = options.auth ?? adminAuthState;

  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createAppRouter({ history });
  const rendered = render(
    <AuthProvider initialState={auth}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));

  return { ...rendered, history, router };
}

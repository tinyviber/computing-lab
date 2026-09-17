import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { LabNavigationProvider } from "../shared/lab/LabNavigationProvider";
import { AuthProvider, type AuthState } from "../shared/auth";
import { createAppRouter } from "../app/router";
import { visibleLabs } from "../app/catalog/labs";

/**
 * Default harness identity: a signed-in teacher. Lesson tests assert lesson
 * mechanics, and a teacher may open every lab regardless of its feature flag,
 * so gating never interferes. Pass `auth` explicitly to test the gate itself.
 */
export const teacherAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const studentAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20260101", name: "张三", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
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

export type RenderAppOptions = { basepath?: string; auth?: AuthState };

export async function renderAppAt(
  initialEntry: string,
  basepathOrOptions: string | RenderAppOptions = "/",
) {
  const options: RenderAppOptions =
    typeof basepathOrOptions === "string" ? { basepath: basepathOrOptions } : basepathOrOptions;
  const basepath = options.basepath ?? "/";
  const auth = options.auth ?? teacherAuthState;
  const role = auth.session?.user.role ?? null;
  const showExperimental = /[?&]showExperimentalLabs=1(?:&|$)/.test(initialEntry);

  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createAppRouter({ history, basepath });
  const rendered = render(
    <AuthProvider initialState={auth}>
      <LabNavigationProvider labs={visibleLabs({ role, showExperimental })}>
        <RouterProvider router={router} />
      </LabNavigationProvider>
    </AuthProvider>,
  );

  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));

  return { ...rendered, history, router };
}

export async function navigateApp(router: ReturnType<typeof createAppRouter>, href: string) {
  await router.navigate({ to: href as never });
  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

export async function navigateAppWithSearch(
  router: ReturnType<typeof createAppRouter>,
  to: string,
  search: Record<string, unknown>,
) {
  await router.navigate({ to: to as never, search: search as never });
  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../shared/api/client";
import { AuthProvider, useAuth, type AuthState } from "../../shared/auth";
import { PreviewAuthBoundary } from "./LabPreviewPage.tsx";

const signedIn: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u1", studentNo: "teacher", name: "教师", role: "teacher" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

function AuthProbe({ id }: { id: string }) {
  const { status, session } = useAuth();
  return <output data-testid={id}>{`${status}:${session?.user.name ?? "none"}`}</output>;
}

describe("PreviewAuthBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows preview content a fixed anonymous context even under a signed-in app", () => {
    render(
      <AuthProvider initialState={signedIn}>
        <PreviewAuthBoundary>
          <AuthProbe id="inside" />
        </PreviewAuthBoundary>
        <AuthProbe id="outside" />
      </AuthProvider>,
    );

    // Whatever the outer provider mounted with, the boundary shadows it.
    expect(screen.getByTestId("inside")).toHaveTextContent("anonymous:none");
    expect(screen.getByTestId("outside")).toHaveTextContent("authenticated:教师");
  });

  it("fires no auth request inside the boundary", () => {
    const get = vi.spyOn(api, "get");
    render(
      <PreviewAuthBoundary>
        <AuthProbe id="inside" />
      </PreviewAuthBoundary>,
    );
    // An AuthProvider without initialState would refresh() on mount; the
    // boundary's fixed anonymous state must suppress that fetch entirely.
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByTestId("inside")).toHaveTextContent("anonymous:none");
  });
});

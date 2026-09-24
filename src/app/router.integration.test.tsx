import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  adminAuthState,
  anonymousAuthState,
  renderAppAt,
  teacherAuthState,
} from "../test/router-test-helpers";

describe("application router integration", () => {
  it("shows the signed-in name only inside the account dropdown trigger", async () => {
    await renderAppAt("/", { auth: teacherAuthState });

    const topbar = screen.getByRole("banner");
    expect(within(topbar).getAllByText("教师", { exact: true })).toHaveLength(1);
    expect(within(topbar).getByRole("button", { name: /教师/ })).toBeInTheDocument();
    expect(within(topbar).queryByText("teacher", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the calculator lab on the classroom home", async () => {
    await renderAppAt("/", { auth: teacherAuthState });

    expect(screen.getByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    const calcCard = screen.getByRole("heading", { name: "实现ALU" }).closest("article");
    expect(calcCard).not.toBeNull();
    expect(within(calcCard as HTMLElement).getByRole("link", { name: "开始" })).toHaveAttribute(
      "href",
      "/labs/calculator",
    );
  });

  it("shows the calculator lab and account menu to admins", async () => {
    await renderAppAt("/", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /管理员/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "账号管理" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("menuitem", { name: "班级看板" })).toBeInTheDocument();
  });

  it("shows anonymous visitors a landing page with a sign-in entry", async () => {
    await renderAppAt("/", { auth: anonymousAuthState });

    expect(screen.getByRole("heading", { name: "计算实验室" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^登录/ })).toHaveAttribute("href", "/login");
  });
});

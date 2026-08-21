import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../test/router-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LabShell", () => {
  it("renders the lesson shell workspace and available lab links through the app router", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getByRole("heading", { level: 1, name: "图像编码" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: /图像编码实验区/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /可用实验/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/labs/image-encoding",
        "/labs/audio-encoding",
        "/labs/home-network",
      ]),
    );
  });

  it("renders feature children directly in the shell-owned main without legacy slot wrappers", async () => {
    await renderAppAt("/labs/image-encoding");

    const main = screen.getByRole("main", { name: /图像编码实验区/ });
    expect(main).toContainElement(screen.getByRole("grid"));
    expect(main.querySelector("#lab-navigation")).toBeNull();
    expect(main.querySelector(".lab-visualization")).toBeNull();
    expect(main.querySelector(".lab-controls")).toBeNull();
    expect(document.querySelector("#lab-navigation")).not.toBe(main);
  });

  it("keeps course-flow semantics out of the shared lab shell", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(document.querySelector("#lab-navigation .lesson-path")).toBeNull();
    expect(document.querySelector(".context-progress")).toBeNull();
    expect(screen.queryByText("学习路径")).not.toBeInTheDocument();
    expect(screen.queryByText("进行中")).not.toBeInTheDocument();
  });

  it("returns focus to menu button after Escape closes mobile rail", async () => {
    const user = userEvent.setup();
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    await renderAppAt("/labs/image-encoding");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /打开实验菜单/ })).toBeInTheDocument(),
    );
    const menu = screen.getByRole("button", { name: /打开实验菜单/ });
    await user.click(menu);
    expect(screen.getAllByRole("button", { name: /关闭实验菜单/ })[0]).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /打开实验菜单/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /打开实验菜单/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("closes mobile rail through scrim and keeps hidden rail inert", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    await renderAppAt("/labs/image-encoding");

    const open = screen.getByRole("button", { name: /打开实验菜单/ });
    const rail = document.querySelector<HTMLElement>("#lab-navigation")!;
    expect(rail).toHaveAttribute("aria-hidden", "true");
    expect(rail).toHaveAttribute("inert");
    await user.click(open);
    expect(rail).not.toHaveAttribute("aria-hidden", "true");
    await user.click(document.querySelector<HTMLButtonElement>(".rail-scrim")!);
    expect(open).toHaveFocus();
  });
});

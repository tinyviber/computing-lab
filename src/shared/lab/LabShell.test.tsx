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
    expect(screen.getByRole("main", { name: /图像编码 workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /available labs/i })).toBeInTheDocument();
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

    const main = screen.getByRole("main", { name: /图像编码 workspace/i });
    expect(main).toContainElement(screen.getByRole("grid"));
    expect(main.querySelector("#lab-navigation")).toBeNull();
    expect(main.querySelector(".lab-visualization")).toBeNull();
    expect(main.querySelector(".lab-controls")).toBeNull();
    expect(document.querySelector("#lab-navigation")).not.toBe(main);
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
      expect(screen.getByRole("button", { name: /open lab menu/i })).toBeInTheDocument(),
    );
    const menu = screen.getByRole("button", { name: /open lab menu/i });
    await user.click(menu);
    expect(screen.getAllByRole("button", { name: /close lab menu/i })[0]).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /open lab menu/i })).toHaveFocus();
    expect(screen.getByRole("button", { name: /open lab menu/i })).toHaveAttribute(
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

    const open = screen.getByRole("button", { name: /open lab menu/i });
    const rail = document.querySelector<HTMLElement>("#lab-navigation")!;
    expect(rail).toHaveAttribute("aria-hidden", "true");
    expect(rail).toHaveAttribute("inert");
    await user.click(open);
    expect(rail).not.toHaveAttribute("aria-hidden", "true");
    await user.click(document.querySelector<HTMLButtonElement>(".rail-scrim")!);
    expect(open).toHaveFocus();
  });
});

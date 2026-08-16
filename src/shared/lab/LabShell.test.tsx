import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabShell } from "./LabShell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LabShell", () => {
  it("renders heading, navigation slot, workspace, and available lab links", () => {
    window.history.replaceState({}, "", "/labs/image-encoding");
    render(
      <LabShell
        eyebrow="TEST / 01"
        navigation={<div data-testid="navigation-slot">Lesson navigation</div>}
        subtitle="Test subtitle"
        title="测试实验"
      >
        <p>Visualization slot</p>
      </LabShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "测试实验" })).toBeInTheDocument();
    expect(screen.getByTestId("navigation-slot")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: /测试实验 workspace/i })).toHaveTextContent(
      "Visualization slot",
    );
    expect(screen.getByRole("navigation", { name: /available labs/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/labs/image-encoding",
        "/labs/audio-encoding",
        "/labs/home-network",
      ]),
    );
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
    window.history.replaceState({}, "", "/labs/image-encoding");
    render(
      <LabShell eyebrow="TEST / 01" subtitle="Test" title="测试实验">
        <p>Content</p>
      </LabShell>,
    );

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
    render(
      <LabShell eyebrow="TEST / 01" subtitle="Test" title="测试实验">
        <p>Content</p>
      </LabShell>,
    );

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

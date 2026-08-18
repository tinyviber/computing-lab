import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("Utf8Page", () => {
  it("renders semantic source, controls, output, and selected evidence", async () => {
    await renderAppAt("/labs/utf8");

    expect(screen.getByRole("main", { name: "UTF-8 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "UTF-8" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /next code point branch/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /UTF-8 fixture/i })).toHaveValue("mixed");
    expect(screen.getByRole("button", { name: "Step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run to end" })).toBeEnabled();
    expect(screen.getByLabelText("Encoded UTF-8 bytes")).toHaveTextContent("—");
  });

  it("supports prediction, mixed transformation, and final byte evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /next code point branch/i }),
      "1-byte",
    );
    const byteCount = screen.getByRole("spinbutton", { name: /final byte count/i });
    await user.clear(byteCount);
    await user.type(byteCount, "10");
    await user.click(button("Record prediction"));
    expect(screen.getByText(/prediction recorded: 1-byte/i)).toBeInTheDocument();

    await user.click(button("Run to end"));
    expect(screen.getByLabelText("Encoded UTF-8 bytes")).toHaveTextContent(
      "65 195 169 231 140 171 240 159 153 130",
    );
    expect(screen.getByRole("region", { name: /final UTF-8 result/i })).toHaveTextContent(
      /4 visible code points → 10 bytes/i,
    );
    expect(screen.getByRole("region", { name: /selected UTF-8 evidence/i })).toHaveTextContent(
      /U\+1F642.*4-byte/i,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8?scenario=mixed");
    await user.click(button("Run to end"));

    const first = screen.getByRole("button", { name: /Frame 1, A, U\+0041, 1-byte/i });
    const second = screen.getByRole("button", { name: /Frame 2, é, U\+00E9, 2-byte/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /selected UTF-8 evidence/i })).toHaveTextContent(
      /0xxxxxxx/i,
    );

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("hydrates fixture boundaries and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8?scenario=emoji");
    await user.click(button("Run to end"));
    expect(screen.getByLabelText("Encoded UTF-8 bytes")).toHaveTextContent("240 159 153 130");

    await user.selectOptions(screen.getByRole("combobox", { name: /UTF-8 fixture/i }), "ascii");
    expect(screen.getByText(/Press Step to inspect the first scalar/i)).toBeInTheDocument();
    await user.click(button("Reset to URL scenario"));
    expect(screen.getByRole("combobox", { name: /UTF-8 fixture/i })).toHaveValue("emoji");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/utf8");
      await userEvent.setup().click(button("Step"));
      expect(screen.getByRole("table", { name: /bytes produced by frame/i })).toBeVisible();
      expect(screen.getByLabelText("Encoded UTF-8 bytes")).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual transformation evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/utf8");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /UTF-8 workspace/i })).getByText(
        /Follow each Unicode scalar/i,
      ),
    ).toBeInTheDocument();
  });
});

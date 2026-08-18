import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ByteEditPage", () => {
  it("renders semantic controls, fixture bytes, and a valid current decode", async () => {
    await renderAppAt("/labs/byte-edit");

    expect(screen.getByRole("main", { name: "字节编辑 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "字节编辑" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /validity/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /byte index/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /byte edit fixture/i })).toHaveValue("mixed");
    expect(screen.getByRole("button", { name: "Apply edit" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /current byte sequence/i })).toHaveTextContent(
      /Valid UTF-8 → “Aé猫🙂”/i,
    );
  });

  it("supports prediction, a corrupting byte edit, and exact rule evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit");

    await user.selectOptions(screen.getByRole("combobox", { name: /validity/i }), "invalid");
    await user.click(button("Record prediction"));
    expect(
      screen.getByText(/prediction recorded: the edited sequence stays invalid/i),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /byte index/i }), "2");
    const value = screen.getByRole("spinbutton", { name: /new value/i });
    await user.clear(value);
    await user.type(value, "65");
    await user.click(button("Apply edit"));

    expect(screen.getByRole("region", { name: /selected byte edit evidence/i })).toHaveTextContent(
      /Byte 2 → 65/,
    );
    expect(screen.getByRole("region", { name: /selected byte edit evidence/i })).toHaveTextContent(
      /Invalid at byte 2: missing continuation byte/i,
    );
    expect(screen.getByRole("region", { name: /selected byte edit evidence/i })).toHaveTextContent(
      /Predicted invalid; observed invalid/i,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit");
    await user.click(button("Truncated"));
    await user.click(button("Original"));

    const first = screen.getByRole("button", { name: /Edit 1, truncated, invalid/i });
    const second = screen.getByRole("button", { name: /Edit 2, original, valid/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /selected byte edit evidence/i })).toHaveTextContent(
      /missing continuation byte/,
    );

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("loads presets and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit?scenario=emoji");
    expect(screen.getByRole("combobox", { name: /byte edit fixture/i })).toHaveValue("emoji");

    await user.click(button("Overlong A"));
    expect(screen.getByRole("region", { name: /current byte sequence/i })).toHaveTextContent(
      /overlong encoding/i,
    );
    await user.click(button("Reset to URL scenario"));
    expect(screen.getByRole("combobox", { name: /byte edit fixture/i })).toHaveValue("emoji");
    expect(screen.getByRole("region", { name: /current byte sequence/i })).toHaveTextContent(
      /Valid UTF-8/i,
    );
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/byte-edit");
      await userEvent.setup().click(button("Surrogate"));
      expect(screen.getByRole("region", { name: /selected byte edit evidence/i })).toBeVisible();
      expect(screen.getByRole("region", { name: /current byte sequence/i })).toHaveTextContent(
        /surrogate code point/i,
      );
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual rule evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/byte-edit");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /字节编辑 workspace/i })).getByText(
        /What happens when you edit one byte/i,
      ),
    ).toBeInTheDocument();
  });
});

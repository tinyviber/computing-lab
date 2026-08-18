import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ProtocolProcessPage", () => {
  it("renders semantic controls, queue evidence, and disabled guided actions", async () => {
    await renderAppAt("/labs/protocol-process");

    expect(screen.getByRole("main", { name: "Protocol Process workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Protocol Process" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /your prediction/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /message scenario/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run to completion" })).toBeEnabled();
    expect(button("Inspect first fault")).toBeDisabled();
    expect(button("Inspect retry")).toBeDisabled();
    expect(button("Inspect first fault")).toHaveAccessibleDescription(
      /these controls select evidence/i,
    );
    await userEvent.setup().click(button("Step"));
    expect(screen.getByRole("table", { name: /protocol counters/i })).toBeInTheDocument();
  });

  it("supports prediction, fault inspection, retry inspection, and final delivery evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /your prediction/i }),
      "delivered",
    );
    await user.selectOptions(screen.getByRole("combobox", { name: /request attempts/i }), "2");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /at timeout, the sender knows/i }),
      "status-unknown",
    );
    await user.click(button("Record prediction"));
    expect(screen.getByText(/prediction recorded: delivered in 2 attempts/i)).toBeInTheDocument();

    await user.click(button("Run to completion"));
    expect(button("Inspect first fault")).toBeEnabled();
    expect(button("Inspect retry")).toBeEnabled();

    await user.click(button("Inspect first fault"));
    const evidence = screen.getByRole("region", { name: /selected event evidence/i });
    expect(evidence).toHaveTextContent(/tick 5/i);
    expect(evidence).toHaveTextContent(/dropped/i);
    expect(evidence).toHaveTextContent(/acknowledgment 1 was dropped/i);

    await user.click(button("Inspect retry"));
    expect(screen.getByRole("region", { name: /selected event evidence/i })).toHaveTextContent(
      /retry attempt 2/i,
    );
    expect(screen.getByRole("region", { name: /final protocol result/i })).toHaveTextContent(
      /status: delivered.*attempts: 2.*accepted: 1.*duplicates suppressed: 1/i,
    );
    expect(screen.getByRole("region", { name: /final protocol result/i })).toHaveTextContent(
      /prediction: delivered in 2 attempts; observed: delivered.*timeout claim: status unknown/i,
    );
  });

  it("selects event frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process?scenario=no-loss");
    await user.click(button("Run to completion"));

    const first = screen.getByRole("button", { name: /Frame 1, tick 0, send-request/i });
    const second = screen.getByRole("button", { name: /Frame 2, tick 2, deliver-request/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");

    const final = screen.getByRole("button", { name: /Frame 4, tick 5, deliver-ack/i });
    final.focus();
    await user.keyboard(" ");
    expect(final).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("switches scenarios and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process?scenario=request-loss");
    await user.click(button("Run to completion"));
    expect(screen.getByRole("region", { name: /final protocol result/i })).toHaveTextContent(
      /attempts: 2.*duplicates suppressed: 0/i,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /message scenario/i }),
      "no-loss",
    );
    expect(screen.getByText(/Press Step to process the first request event/i)).toBeInTheDocument();
    await user.click(button("Reset to URL scenario"));
    expect(screen.getByRole("combobox", { name: /message scenario/i })).toHaveValue("request-loss");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/protocol-process");
      expect(screen.getByRole("button", { name: "Step" })).toBeVisible();
      await userEvent.setup().click(button("Step"));
      expect(screen.getByRole("table", { name: /protocol counters/i })).toBeVisible();
      expect(screen.getByRole("region", { name: /final protocol result/i })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual protocol evidence instead of a legacy workflow or shared panels", async () => {
    await renderAppAt("/labs/protocol-process");

    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^(ready|editing|success|failure)$/i)).toHaveLength(0);
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /Protocol Process workspace/i })).getByText(
        /simulated and every queue change is inspectable/i,
      ),
    ).toBeInTheDocument();
  });
});

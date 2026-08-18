import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("MonteCarloPage", () => {
  it("renders semantic controls, fixture evidence, and comparison rows", async () => {
    await renderAppAt("/labs/monte-carlo");

    expect(screen.getByRole("main", { name: "Monte Carlo π workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Monte Carlo π" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /final estimate relative to π/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Monte Carlo fixture/i })).toHaveValue("medium");
    expect(screen.getByRole("button", { name: "Step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run to end" })).toBeEnabled();
    expect(screen.getByRole("table", { name: "Fixture comparison" })).toHaveTextContent(
      /3\.1448.*3\.1328/i,
    );
  });

  it("supports prediction, convergence evidence, and the final estimate", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=small");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /final estimate relative to π/i }),
      "below",
    );
    await user.click(button("Record prediction"));
    expect(screen.getByText(/prediction recorded: estimate finishes below π/i)).toBeInTheDocument();

    await user.click(button("Run to end"));
    expect(screen.getByLabelText("Final Monte Carlo estimate")).toHaveTextContent("3.08");
    expect(screen.getByRole("region", { name: /final Monte Carlo result/i })).toHaveTextContent(
      /final error 0\.0616/i,
    );
    expect(
      screen.getByRole("region", { name: /selected Monte Carlo evidence/i }),
    ).toHaveTextContent(/Batch 4 of 1000 samples/i);
    expect(screen.getByRole("region", { name: /convergence table/i })).toHaveTextContent(
      /2\.944.*3\.0507/i,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=small");
    await user.click(button("Run to end"));

    const first = screen.getByRole("button", { name: /Batch 1, 250 samples, 184 inside/i });
    const second = screen.getByRole("button", { name: /Batch 2, 500 samples, 375 inside/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("region", { name: /selected Monte Carlo evidence/i }),
    ).toHaveTextContent(/2\.944/);

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("hydrates fixtures and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=large");
    expect(screen.getByRole("combobox", { name: /Monte Carlo fixture/i })).toHaveValue("large");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Monte Carlo fixture/i }),
      "small",
    );
    expect(screen.getByText(/Press Step to draw the first 250 random points/i)).toBeInTheDocument();
    await user.click(button("Reset to URL scenario"));
    expect(screen.getByRole("combobox", { name: /Monte Carlo fixture/i })).toHaveValue("large");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/monte-carlo?scenario=small");
      await userEvent.setup().click(button("Step"));
      expect(screen.getByRole("table", { name: /convergence by batch/i })).toBeVisible();
      expect(screen.queryByLabelText("Final Monte Carlo estimate")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: /selected Monte Carlo evidence/i })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual convergence evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/monte-carlo");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /Monte Carlo π workspace/i })).getByText(
        /How many random points does it take to find π/i,
      ),
    ).toBeInTheDocument();
  });
});

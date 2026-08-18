import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ProgramExecutionPage", () => {
  it("renders semantic source, controls, variable evidence, and labeled output", async () => {
    await renderAppAt("/labs/program-execution");

    expect(screen.getByRole("main", { name: "程序执行 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "程序执行" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Program source" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /initial variables/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run to end" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect variable change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inspect loop stop" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Inspect variable change" }),
    ).toHaveAccessibleDescription(/guided inspection becomes available/i);
    expect(screen.getByRole("status", { name: /program output/i })).toHaveTextContent("—");
  });

  it("supports the prediction → variable-change → loop-stop → output trajectory", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution");

    await user.type(screen.getByRole("spinbutton", { name: /predicted output/i }), "6");
    await user.click(button("Record prediction"));
    expect(screen.getByText(/prediction recorded/i)).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) await user.click(button("Step"));
    expect(button("Inspect variable change")).toBeEnabled();
    await user.click(button("Inspect variable change"));

    const evidence = screen.getByRole("region", { name: /selected frame evidence/i });
    expect(evidence).toHaveTextContent(/total: 0.*1/i);
    expect(
      screen.getByRole("button", { name: /Frame 5.*line 5.*assignment/i }),
    ).toBeInTheDocument();

    await user.click(button("Run to end"));
    expect(button("Inspect loop stop")).toBeEnabled();
    await user.click(button("Inspect loop stop"));
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /4 <= 3 → false/i,
    );
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /loop body is skipped/i,
    );
    expect(screen.getByRole("status", { name: /program output/i })).toHaveTextContent("6");
    expect(screen.getByText(/prediction: 6; observed: 6/i)).toBeInTheDocument();
    expect(screen.getByText(/completed normally/i)).toBeInTheDocument();
  });

  it("selects trace frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution");
    await user.click(button("Run to end"));

    const firstFrame = screen.getByRole("button", { name: /Frame 1, line 1, assignment/i });
    const secondFrame = screen.getByRole("button", { name: /Frame 2, line 2, assignment/i });
    firstFrame.focus();
    await user.tab();
    expect(secondFrame).toHaveFocus();
    firstFrame.focus();
    await user.keyboard("{Enter}");
    expect(firstFrame).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /total becomes 0/i,
    );

    const finalFrame = screen.getByRole("button", { name: /Frame 13, line 7, print/i });
    finalFrame.focus();
    await user.keyboard(" ");
    expect(finalFrame).toHaveAttribute("aria-current", "true");
    expect(firstFrame).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /output 6/i,
    );
  });

  it("shows zero-iteration evidence and clears transient state on fixture switch/reset", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution?fixture=off-by-one");
    await user.click(button("Run to end"));
    expect(screen.getByRole("status", { name: /program output/i })).toHaveTextContent("3");
    await user.click(button("Inspect loop stop"));
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /3 < 3 → false/i,
    );

    await user.click(button(/^Zero iterations/));
    expect(
      screen.getByText(/Press Step to create the first assignment frame/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /program output/i })).toHaveTextContent("—");
    expect(button("Inspect variable change")).toBeDisabled();

    await user.click(button("Run to end"));
    await user.click(button("Inspect loop stop"));
    expect(screen.getByRole("region", { name: /selected frame evidence/i })).toHaveTextContent(
      /4 <= 3 → false/i,
    );
    expect(screen.getByRole("status", { name: /program output/i })).toHaveTextContent("10");

    await user.click(button("Reset to URL scenario"));
    expect(screen.getByRole("button", { name: /Off-by-one boundary/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(/Press Step to create the first assignment frame/i),
    ).toBeInTheDocument();
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/program-execution");
      expect(screen.getByRole("list", { name: "Program source" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Step" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Run to end" })).toBeVisible();
      expect(screen.getByRole("table", { name: /initial variables/i })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses text evidence instead of a legacy workflow or shared lesson panels", async () => {
    await renderAppAt("/labs/program-execution");

    expect(
      screen.queryByRole("button", { name: /^(submit|check configuration|check)$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^(ready|editing|success|failure)$/i)).toHaveLength(0);
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /程序执行 workspace/i })).getByText(
        /每一步只执行一条/i,
      ),
    ).toBeInTheDocument();
  });
});

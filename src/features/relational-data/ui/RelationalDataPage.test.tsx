import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("RelationalDataPage", () => {
  it("renders semantic controls, fixture evidence, and constraint rows", async () => {
    await renderAppAt("/labs/relational-data");

    expect(screen.getByRole("main", { name: "关系数据 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "关系数据" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /row count/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /relational fixture/i })).toHaveValue("catalog");
    expect(screen.getByRole("button", { name: "Step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run to end" })).toBeEnabled();
    expect(
      screen.getByRole("table", { name: /constraint checks over the catalog/i }),
    ).toHaveTextContent(/FAIL.*99/i);
    const borrowers = screen.getByRole("table", {
      name: /borrower source rows: NULL versus empty string/i,
    });
    expect(within(borrowers).getByText("NULL")).toBeInTheDocument();
    expect(within(borrowers).getByText('""')).toBeInTheDocument();
    expect(screen.getByText(/IS NOT NULL.*rejects only NULL/i)).toBeInTheDocument();
  });

  it("supports prediction, query provenance, and the broken loan lesson", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/relational-data");

    const rowCount = screen.getByRole("spinbutton", { name: /row count/i });
    await user.clear(rowCount);
    await user.type(rowCount, "4");
    await user.click(button("Record prediction"));
    expect(
      screen.getByText(/prediction recorded: the next query returns 4 rows/i),
    ).toBeInTheDocument();

    await user.click(button("Run to end"));
    expect(screen.getByRole("region", { name: /selected relational evidence/i })).toHaveTextContent(
      /Loans per borrower/,
    );
    expect(screen.getByRole("region", { name: /selected relational evidence/i })).toHaveTextContent(
      /Derived cells: loans is computed/i,
    );
    const provenance = screen.getByRole("table", {
      name: /provenance: which source rows produced each result/i,
    });
    expect(provenance).toHaveTextContent(/loan-1/);
    expect(provenance).toHaveTextContent(/loan-2/);
    expect(provenance).toHaveTextContent(/loan-1, person-1, book-3/);
    expect(provenance).toHaveTextContent(/loan-4, person-3, book-1/);
    expect(screen.getByRole("region", { name: /predicted versus actual/i })).toHaveTextContent(
      /All books\s*44/i,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/relational-data");
    await user.click(button("Run to end"));

    const first = screen.getByRole("button", { name: /Query 1, All books, 4 rows/i });
    const second = screen.getByRole("button", { name: /Query 2, Available books, 2 rows/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /selected relational evidence/i })).toHaveTextContent(
      /The Left Hand of Darkness/,
    );

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/relational-data");
      await userEvent.setup().click(button("Step"));
      expect(screen.getByRole("table", { name: /query result rows/i })).toBeVisible();
      expect(screen.getByRole("region", { name: /relational constraints/i })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual relational evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/relational-data");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /关系数据 workspace/i })).getByText(
        /How does a fixed set of rows answer a query/i,
      ),
    ).toBeInTheDocument();
  });
});

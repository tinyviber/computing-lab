import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { deriveIntegerModel } from "../domain/model";
import { renderAppAt } from "../../../test/router-test-helpers";

function evidenceCards() {
  return {
    carry: screen.getByRole("heading", { name: /carry-out:/i }).closest("article")!,
    overflow: screen.getByRole("heading", { name: /signed overflow:/i }).closest("article")!,
  };
}

describe("TwosComplementPage", () => {
  it("hydrates a direct URL with its canonical word, reading, and model evidence", async () => {
    const model = deriveIntegerModel({ width: 4, left: "1111", right: "0001" });
    await renderAppAt("/labs/twos-complement?width=4&a=1111&b=0001&reading=unsigned");

    expect(screen.getByRole("main", { name: /二进制补码 workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 bit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Unsigned" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "A, bit 3, 1" })).toBeInTheDocument();
    expect(screen.getByText("0000", { selector: ".twos-result-card code" })).toBeInTheDocument();

    const evidence = evidenceCards();
    expect(evidence.carry).toHaveAttribute("data-carry-out", String(model.carryOut));
    expect(evidence.overflow).toHaveAttribute(
      "data-signed-overflow",
      String(model.signed.overflow),
    );
    expect(evidence.carry).toHaveTextContent("Carry-out: yes");
    expect(evidence.overflow).toHaveTextContent("Signed overflow: no");
    expect(screen.getByText(/As unsigned: 15 \+ 1 stores 0/i)).toBeInTheDocument();
  });

  it("supports width, bit, reading, examples, distinct flags, and URL reset without submit flow", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/twos-complement?width=4&a=0111&b=0001&reading=signed");

    await user.click(screen.getByRole("button", { name: "8 bit" }));
    expect(screen.getByRole("button", { name: "A, bit 7, 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A, bit 0, 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "A, bit 0, 1" }));
    expect(screen.getByRole("button", { name: "A, bit 0, 0" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unsigned" }));
    expect(screen.getByText("primary: unsigned")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "4 bit" }));
    await user.click(screen.getByRole("button", { name: /^7 \+ 1/ }));

    const expected = deriveIntegerModel({ width: 4, left: "0111", right: "0001" });
    const evidence = evidenceCards();
    expect(screen.getByText("1000", { selector: ".twos-result-card code" })).toBeInTheDocument();
    expect(evidence.carry).toHaveAttribute("data-carry-out", String(expected.carryOut));
    expect(evidence.overflow).toHaveAttribute(
      "data-signed-overflow",
      String(expected.signed.overflow),
    );
    expect(evidence.carry).toHaveTextContent("Carry-out: no");
    expect(evidence.overflow).toHaveTextContent("Signed overflow: yes");
    expect(evidence.overflow).toHaveTextContent(/sign-bit carry-in 1 ≠ carry-out 0/i);
    expect(screen.queryByRole("button", { name: /submit|check answer/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset to url scenario/i }));
    expect(screen.getByRole("button", { name: "A, bit 0, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1000", { selector: ".twos-result-card code" })).toBeInTheDocument();
  });
});

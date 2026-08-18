import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { deriveIntegerModel } from "../domain/model";
import { renderAppAt } from "../../../test/router-test-helpers";

function evidenceCards() {
  return {
    carry: screen.getByRole("heading", { name: /输出进位：/ }).closest("article")!,
    overflow: screen.getByRole("heading", { name: /有符号溢出：/ }).closest("article")!,
  };
}

describe("TwosComplementPage", () => {
  it("hydrates a direct URL with its canonical word, reading, and model evidence", async () => {
    const model = deriveIntegerModel({ width: 4, left: "1111", right: "0001" });
    await renderAppAt("/labs/twos-complement?width=4&a=1111&b=0001&reading=unsigned");

    expect(screen.getByRole("main", { name: /二进制补码 workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 位" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "无符号" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "A，第 3 位，1" })).toBeInTheDocument();
    expect(screen.getByText("0000", { selector: ".twos-result-card code" })).toBeInTheDocument();

    const evidence = evidenceCards();
    expect(evidence.carry).toHaveAttribute("data-carry-out", String(model.carryOut));
    expect(evidence.overflow).toHaveAttribute(
      "data-signed-overflow",
      String(model.signed.overflow),
    );
    expect(evidence.carry).toHaveTextContent("输出进位：有");
    expect(evidence.overflow).toHaveTextContent("有符号溢出：无");
    expect(screen.getByText(/按无符号.*15 \+ 1 存储为 0/)).toBeInTheDocument();
  });

  it("supports width, bit, reading, examples, distinct flags, and URL reset without submit flow", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/twos-complement?width=4&a=0111&b=0001&reading=signed");

    await user.click(screen.getByRole("button", { name: "8 位" }));
    expect(screen.getByRole("button", { name: "A，第 7 位，0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A，第 0 位，1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "A，第 0 位，1" }));
    expect(screen.getByRole("button", { name: "A，第 0 位，0" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "无符号" }));
    expect(screen.getByText(/按无符号.*解释/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "4 位" }));
    await user.click(screen.getByRole("button", { name: /^7 \+ 1/ }));

    const expected = deriveIntegerModel({ width: 4, left: "0111", right: "0001" });
    const evidence = evidenceCards();
    expect(screen.getByText("1000", { selector: ".twos-result-card code" })).toBeInTheDocument();
    expect(evidence.carry).toHaveAttribute("data-carry-out", String(expected.carryOut));
    expect(evidence.overflow).toHaveAttribute(
      "data-signed-overflow",
      String(expected.signed.overflow),
    );
    expect(evidence.carry).toHaveTextContent("输出进位：无");
    expect(evidence.overflow).toHaveTextContent("有符号溢出：有");
    expect(evidence.overflow).toHaveTextContent(/符号位输入进位 1 ≠ 输出进位 0/);
    expect(screen.queryByRole("button", { name: /submit|check answer/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /恢复初始情境/ }));
    expect(screen.getByRole("button", { name: "A，第 0 位，1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "有符号" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1000", { selector: ".twos-result-card code" })).toBeInTheDocument();
  });

  it("shows width-relative 8-bit boundary and negative overflow evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/twos-complement?width=8&a=00000000&b=00000000&reading=signed");

    await user.click(screen.getByRole("button", { name: /^127 \+ 1/ }));
    expect(
      screen.getByText("10000000", { selector: ".twos-result-card code" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "有符号溢出：有" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "输出进位：无" })).toBeInTheDocument();
    expect(screen.getByText(/127 \+ 1.*存储为.*−128/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^−128 \+ −1/ }));
    expect(
      screen.getByText("01111111", { selector: ".twos-result-card code" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "有符号溢出：有" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "输出进位：有" })).toBeInTheDocument();
    expect(screen.getByText(/−128 \+ −1.*存储为.*127/)).toBeInTheDocument();
    expect(screen.getByText(/符号位输入进位 0 ≠ 输出进位 1/)).toBeInTheDocument();
  });
});

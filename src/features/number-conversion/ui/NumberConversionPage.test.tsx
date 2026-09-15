import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

describe("NumberConversionPage", () => {
  it("teaches integer conversion one short-division step at a time", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/number-conversion");

    expect(screen.getByRole("main", { name: "进制转换教学区" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "短除法：连续除以 2" })).toBeInTheDocument();
    expect(screen.getByText("已显示 0 / 4 步")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("13 ÷ 2 = 6 …… 1")).toBeInTheDocument();
    expect(screen.getByText("已显示 1 / 4 步")).toBeInTheDocument();
  });

  it("separates fraction multiplication and positional-sum reading", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/number-conversion");

    await user.click(screen.getByRole("tab", { name: "小数部分" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "乘 2：取整数部分作为下一位" })).toBeInTheDocument();
    expect(screen.getByText("0.625 × 2 = 1.25")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "二进制转十进制" }));
    expect(
      screen.getByRole("heading", { name: "按位相加：每一位乘以对应次方" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0.625")).toBeInTheDocument();
  });
});

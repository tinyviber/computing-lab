import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const next = () => screen.getByRole("button", { name: "执行下一个事件" });

async function runToEnd() {
  const user = userEvent.setup();
  while (!next().hasAttribute("disabled")) await user.click(next());
}

describe("ProtocolProcessPage", () => {
  it.each([
    ["no-loss", "已送达", "尝试次数：1", "重复抑制：0"],
    ["request-loss", "已送达", "尝试次数：2", "重复抑制：0"],
    ["ack-loss", "已送达", "尝试次数：2", "重复抑制：1"],
    ["receiver-silent", "已失败", "尝试次数：2", "重复抑制：0"],
  ] as const)(
    "shows semantic and queue-projection evidence for %s",
    async (scenario, status, attempts, duplicates) => {
      await renderAppAt(`/labs/protocol-process?scenario=${scenario}`);
      expect(screen.getByRole("main", { name: "可靠送达实验区" })).toBeInTheDocument();
      expect(next()).toBeEnabled();
      await runToEnd();
      const trace = screen.getByRole("region", { name: "协议事件记录" });
      expect(within(trace).getAllByRole("button").length).toBeGreaterThan(0);
      expect(screen.getByRole("table", { name: /之前的队列/ })).toBeInTheDocument();
      expect(screen.getByRole("table", { name: /之后的队列/ })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "最终协议结果" })).toHaveTextContent(
        new RegExp(`${status}.*${attempts}.*${duplicates}`),
      );
    },
  );

  it("renders timeout uncertainty and keeps prediction non-blocking", async () => {
    await renderAppAt("/labs/protocol-process?scenario=ack-loss");
    await runToEnd();
    const timeout = screen.getByRole("button", { name: /超时/ });
    await userEvent.setup().click(timeout);
    expect(screen.getByRole("region", { name: "选中事件结果" })).toHaveTextContent(
      /超时只说明确认尚未被发送方观察到.*不能证明接收方没有收到请求/,
    );
  });

  it("restores the scenario from the initial URL after exploratory switching", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process?scenario=request-loss");
    await user.selectOptions(screen.getByRole("combobox", { name: "消息情境" }), "no-loss");
    await user.click(screen.getByRole("button", { name: "恢复初始情境" }));
    expect(screen.getByRole("combobox", { name: "消息情境" })).toHaveValue("request-loss");
  });

  it("has no legacy submit, score, or run-all workflow", async () => {
    await renderAppAt("/labs/protocol-process");
    expect(
      screen.queryByRole("button", { name: /submit|score|run-all|运行到结束/i }),
    ).not.toBeInTheDocument();
    expect(next()).toBeEnabled();
  });
});

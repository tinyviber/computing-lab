import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp) => screen.getByRole("button", { name });

describe("HomeNetworkPage", () => {
  it("renders the Home Network workspace with semantic controls and SVG text evidence", async () => {
    await renderAppAt("/labs/home-network");

    expect(screen.getByRole("main", { name: "家庭网络探针 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "家庭网络探针" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /inspect device|设备/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /target|目标|目的地/i })).toBeInTheDocument();
    expect(screen.getAllByText(/source.*laptop/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /send probe|probe|发送探测|发送探针/i }),
    ).toBeInTheDocument();

    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveTextContent(/路由器|router/i);
    expect(svg).toHaveTextContent(/学习电脑|laptop/i);
    expect(svg?.querySelectorAll("text").length).toBeGreaterThan(0);
  });

  it("exposes inspect, edit, and trace controls with accessible text rather than color-only status", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/home-network?scenario=static-printer&target=printer");

    const inspector = screen.getByRole("combobox", { name: /inspect device|设备/i });
    await user.selectOptions(inspector, "printer");
    expect(inspector).toHaveValue("printer");

    const printerIp = screen.getByRole("textbox", {
      name: /ipv4 address|ip.*地址/i,
    });
    expect(printerIp).toHaveAccessibleName();
    await user.click(button(/send probe|probe|发送探测|发送探针/i));

    const trace = screen.getByRole("region", { name: /事件链|causal trace|trace/i });
    expect(trace).toHaveTextContent(/arp|route|no-route|gateway|失败|不可达/i);
    expect(trace.textContent).toMatch(/arp|route|no-route|gateway|失败|不可达/i);
    expect(
      screen.getByRole("region", { name: /first failure|首个失败|no-route/i }),
    ).toHaveTextContent(/router|route|失败|不可达/i);
  });

  it("supports the printer repair trajectory and preserves both probe history entries", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/home-network?scenario=static-printer&target=printer");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /inspect device|设备/i }),
      "printer",
    );
    await user.click(button(/send probe|probe|发送探测|发送探针/i));
    const trace = () => screen.getByRole("region", { name: /事件链|causal trace|trace/i });
    const failedTrace = trace().textContent;

    const printerIp = screen.getByRole("textbox", {
      name: /ipv4 address|ip.*地址/i,
    });
    await user.clear(printerIp);
    await user.type(printerIp, "192.168.1.30");
    await user.click(button(/send probe|probe|发送探测|发送探针/i));

    expect(trace().textContent).not.toBe(failedTrace);
    expect(trace()).toHaveTextContent(/direct|local|直接|局域网/i);

    const history = screen
      .getByRole("heading", { name: /probe history comparison|历史/i })
      .closest("section");
    expect(history).not.toBeNull();
    expect(within(history as HTMLElement).getAllByRole("listitem")).toHaveLength(2);
    expect(within(history as HTMLElement).getAllByRole("listitem")[0]).toHaveTextContent(
      /blocked/i,
    );
    expect(within(history as HTMLElement).getAllByRole("listitem")[1]).toHaveTextContent(
      /delivered/i,
    );
  });

  it("keeps topology readouts live, locks fixed endpoints, and reports prediction feedback", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/home-network?scenario=static-printer");

    expect(document.querySelector("svg")).toHaveTextContent("192.168.2.30");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /inspect device|设备/i }),
      "printer",
    );
    const printerIp = screen.getByRole("textbox", { name: /ipv4 address|ip.*地址/i });
    await user.clear(printerIp);
    await user.type(printerIp, "192.168.1.30");
    expect(document.querySelector("svg")).toHaveTextContent("192.168.1.30");
    expect(screen.getByRole("button", { name: /打印机.*192\.168\.1\.30/i })).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /optional prediction/i }),
      "local",
    );
    await user.click(button(/send probe|probe|发送探测|发送探针/i));
    expect(document.querySelector(".probe-prediction-feedback")).toHaveTextContent(
      /Prediction: local \/ direct.*observed: local \/ direct.*match/i,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /inspect device|设备/i }),
      "internet",
    );
    expect(screen.getByRole("textbox", { name: /ipv4 address|ip.*地址/i })).toHaveAttribute(
      "readonly",
    );
  });

  it("does not expose the legacy phase/submit/check surface or shared panel classes", async () => {
    await renderAppAt("/labs/home-network");

    expect(screen.queryAllByText(/^(ready|editing|success|failure)$/i)).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: /submit|check configuration|检查配置/i }),
    ).not.toBeInTheDocument();
    for (const selector of [
      ".visualization-panel",
      ".formula-panel",
      ".audio-controls",
      ".lab-visualization",
      ".lab-controls",
    ]) {
      expect(document.querySelector(selector), `${selector} is a legacy shared panel`).toBeNull();
    }
  });
});

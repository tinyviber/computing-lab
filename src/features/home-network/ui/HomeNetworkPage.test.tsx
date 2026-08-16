import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HomeNetworkPage } from "./HomeNetworkPage";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

describe("HomeNetworkPage", () => {
  it("renders device palette and accessible topology links for every fixture edge", () => {
    window.history.replaceState({}, "", "/labs/home-network");
    render(<HomeNetworkPage />);

    const palette = screen.getByRole("region", { name: /device palette/i });
    expect(within(palette).getAllByRole("button")).toHaveLength(3);
    expect(within(palette).getByRole("button", { name: /家庭路由器/i })).toBeInTheDocument();
    expect(within(palette).getByRole("button", { name: /学习电脑/i })).toBeInTheDocument();
    expect(within(palette).getByRole("button", { name: /手机/i })).toBeInTheDocument();

    const topology = screen.getByRole("region", { name: /network topology/i });
    expect(
      within(topology).getByRole("img", { name: /家庭路由器.*学习电脑/i }),
    ).toBeInTheDocument();
    expect(within(topology).getByRole("img", { name: /家庭路由器.*手机/i })).toBeInTheDocument();
    expect(document.querySelector(".visualization-panel")).toBeInTheDocument();
    expect(document.querySelector(".formula-panel")).toBeInTheDocument();
  });

  it("renders topology, inspector, device addresses, and status", () => {
    window.history.replaceState({}, "", "/labs/home-network");
    render(<HomeNetworkPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: /家庭网络配置 workspace/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: /network configuration inspector/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^家庭路由器, 192\.168\.1\.1$/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^学习电脑, 192\.168\.1\.10$/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /default gateway/i })).toHaveValue("192.168.1.1");
    expect(screen.getByRole("status")).toHaveTextContent(/ready/i);
  });

  it("reproduces wrong-gateway scenario and exposes alert after check", () => {
    window.history.replaceState({}, "", "/labs/home-network?scenario=wrong-gateway");
    render(<HomeNetworkPage />);

    const gateway = screen.getByRole("combobox", { name: /default gateway/i });
    expect(gateway).toHaveValue("192.168.1.254");
    fireEvent.click(screen.getByRole("button", { name: /check configuration/i }));

    expect(document.querySelector(".phase-failure")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/wrong gateway|router address/i);
  });

  it("maps explicit gateway=wrong query to invalid state and exposes issue code", () => {
    window.history.replaceState({}, "", "/labs/home-network?gateway=wrong");
    render(<HomeNetworkPage />);

    expect(screen.getByRole("combobox", { name: /default gateway/i })).toHaveValue("192.168.1.254");
    fireEvent.click(screen.getByRole("button", { name: /check configuration/i }));

    expect(document.querySelector(".phase-failure")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/failure|wrong gateway/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/gateway-mismatch|outside-subnet/i);
  });

  it("allows fixing gateway and reports successful validation", () => {
    window.history.replaceState({}, "", "/labs/home-network");
    render(<HomeNetworkPage />);

    fireEvent.change(screen.getByRole("combobox", { name: /default gateway/i }), {
      target: { value: "192.168.1.254" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /default gateway/i }), {
      target: { value: "192.168.1.1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check configuration/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/success|connected/i);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-invalid", "true");
    expect(
      within(
        screen.getByRole("complementary", { name: /network configuration inspector/i }),
      ).getByText("192.168.1.0/24"),
    ).toBeInTheDocument();
  });
});

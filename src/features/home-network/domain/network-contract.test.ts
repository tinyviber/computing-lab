import { describe, expect, it } from "vitest";
import * as model from "./model";

type Callable = (...args: unknown[]) => unknown;

function requiredFunction(name: string): Callable {
  const candidate = (model as Record<string, unknown>)[name];
  expect(typeof candidate, `${name} must be exported by network domain`).toBe("function");
  return candidate as Callable;
}

const validDevices = [
  { id: "router", name: "家庭路由器", kind: "router", ip: "192.168.1.1" },
  { id: "laptop", name: "学习电脑", kind: "laptop", ip: "192.168.1.20" },
  { id: "phone", name: "手机", kind: "phone", ip: "192.168.1.21" },
  { id: "printer", name: "打印机", kind: "printer", ip: "192.168.1.30" },
];

const validConfig = {
  devices: validDevices,
  subnet: "192.168.1.0/24",
  gateway: "192.168.1.1",
};

describe("home network domain contract", () => {
  it("accepts canonical IPv4/CIDR topology and returns no issues", () => {
    const validateNetwork = requiredFunction("validateNetwork");
    expect(
      validateNetwork({
        cidr: validConfig.subnet,
        gateway: validConfig.gateway,
        nodes: validDevices.slice(0, 3),
      }),
    ).toMatchObject({ valid: true, issues: [] });
  });

  it("computes network and broadcast boundaries and rejects outside gateway", () => {
    const validateNetwork = requiredFunction("validateNetwork");

    expect(
      validateNetwork({
        cidr: validConfig.subnet,
        gateway: "10.0.0.1",
        nodes: validDevices.slice(0, 3),
      }),
    ).toMatchObject({
      valid: false,
      issues: ["outside-subnet", "gateway-mismatch"],
    });
    expect(
      validateNetwork({
        cidr: "192.168.1.128/25",
        gateway: validConfig.gateway,
        nodes: validDevices.slice(0, 3),
      }),
    ).toMatchObject({
      valid: false,
      issues: ["outside-subnet"],
    });
  });

  it("reports invalid and duplicate IPs in fixed deterministic order", () => {
    const validateNetwork = requiredFunction("validateNetwork");
    const result = validateNetwork({
      cidr: validConfig.subnet,
      gateway: validConfig.gateway,
      nodes: [
        ...validDevices,
        { id: "bad", name: "坏设备", kind: "laptop", ip: "not-an-ip" },
        { id: "duplicate", name: "重复设备", kind: "phone", ip: "192.168.1.20" },
      ],
    }) as { valid: boolean; issues: string[] };

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(["invalid-ip", "duplicate-ip"]);
  });
});

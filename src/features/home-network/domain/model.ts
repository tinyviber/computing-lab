export type DeviceKind = "router" | "laptop" | "phone";

export type NetworkNode = {
  id: string;
  name: string;
  kind: DeviceKind;
  ip: string;
};

export type NetworkLink = {
  from: string;
  to: string;
};

export type NetworkConfig = {
  cidr: string;
  gateway: string;
  nodes: NetworkNode[];
};

export type IssueCode =
  | "invalid-cidr"
  | "invalid-ip"
  | "network-address"
  | "broadcast-address"
  | "duplicate-ip"
  | "outside-subnet"
  | "gateway-mismatch";

export type NetworkValidation = { valid: boolean; issues: IssueCode[] };

export type HomeNetworkScenario = "balanced" | "wrong-gateway";
export type HomeNetworkScenarioState = { scenario: HomeNetworkScenario; gateway: string };

export const NETWORK_FIXTURE: NetworkConfig = {
  cidr: "192.168.1.0/24",
  gateway: "192.168.1.1",
  nodes: [
    { id: "router", name: "家庭路由器", kind: "router", ip: "192.168.1.1" },
    { id: "laptop", name: "学习电脑", kind: "laptop", ip: "192.168.1.10" },
    { id: "phone", name: "手机", kind: "phone", ip: "192.168.1.11" },
  ],
};

export const NETWORK_LINKS: NetworkLink[] = [
  { from: "router", to: "laptop" },
  { from: "router", to: "phone" },
];

export const NETWORK_DEVICES = NETWORK_FIXTURE.nodes;

function parseIpv4(value: string): number | undefined {
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return undefined;
  return octets.reduce((address, octet) => (address << 8) | octet, 0) >>> 0;
}

function parseCidr(
  value: string,
): { network: number; broadcast: number; prefix: number } | undefined {
  const [addressText, prefixText, ...rest] = value.trim().split("/");
  if (!addressText || !prefixText || rest.length > 0 || !/^\d+$/.test(prefixText)) return undefined;
  const address = parseIpv4(addressText);
  const prefix = Number(prefixText);
  if (address === undefined || prefix < 0 || prefix > 32) return undefined;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = address & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network: network >>> 0, broadcast, prefix };
}

export function validateNetwork(config: NetworkConfig): NetworkValidation {
  const issues: IssueCode[] = [];
  const subnet = parseCidr(config.cidr);
  const parsedNodes = config.nodes.map((node) => ({ node, value: parseIpv4(node.ip) }));
  const gateway = parseIpv4(config.gateway);

  if (!subnet) issues.push("invalid-cidr");
  if (parsedNodes.some(({ value }) => value === undefined) || gateway === undefined) {
    issues.push("invalid-ip");
  }

  const validAddresses = [
    ...parsedNodes.flatMap(({ value }) => (value === undefined ? [] : [value])),
    ...(gateway === undefined ? [] : [gateway]),
  ];
  if (subnet) {
    if (validAddresses.includes(subnet.network)) issues.push("network-address");
    if (validAddresses.includes(subnet.broadcast)) issues.push("broadcast-address");
  }

  const counts = new Map<number, number>();
  parsedNodes.forEach(({ value }) => {
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  if ([...counts.values()].some((count) => count > 1)) issues.push("duplicate-ip");

  if (subnet) {
    const outside = validAddresses.some(
      (address) => address < subnet.network || address > subnet.broadcast,
    );
    if (outside) issues.push("outside-subnet");
  }

  const router = parsedNodes.find(({ node }) => node.kind === "router");
  if (router?.value !== undefined && gateway !== undefined && router.value !== gateway) {
    issues.push("gateway-mismatch");
  }

  return { valid: issues.length === 0, issues };
}

function toParams(input: URLSearchParams | string): URLSearchParams {
  return input instanceof URLSearchParams ? input : new URLSearchParams(input.replace(/^\?/, ""));
}

export function parseHomeNetworkScenario(
  input: URLSearchParams | string,
): HomeNetworkScenarioState {
  const params = toParams(input);
  const scenario: HomeNetworkScenario =
    params.get("scenario") === "wrong-gateway" ? "wrong-gateway" : "balanced";
  const presetGateway = scenario === "wrong-gateway" ? "192.168.1.254" : NETWORK_FIXTURE.gateway;
  const explicitGateway = params.get("gateway");
  const explicitValue = explicitGateway === "wrong" ? "192.168.1.254" : explicitGateway;
  return {
    scenario,
    gateway: explicitValue !== null && explicitValue.trim() !== "" ? explicitValue : presetGateway,
  };
}

export function getNetworkScenario(search: string): HomeNetworkScenario | null {
  const scenario = parseHomeNetworkScenario(search).scenario;
  return scenario === "balanced" && !new URLSearchParams(search.replace(/^\?/, "")).has("scenario")
    ? null
    : scenario;
}

export function validateGateway(gateway: string): boolean {
  return validateNetwork({ ...NETWORK_FIXTURE, gateway }).valid;
}

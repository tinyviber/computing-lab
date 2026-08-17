export type DeviceKind = "router" | "laptop" | "printer" | "internet";

export type NetworkDeviceId = "router" | "laptop" | "printer" | "internet";
export type HostDeviceId = "laptop" | "printer";
export type ProbeTarget = "printer" | "internet";
export type L2SegmentId = "lan" | "wan";

export type L2Segment = {
  id: L2SegmentId;
  name: string;
  members: readonly NetworkDeviceId[];
};

export type NetworkLink = {
  from: NetworkDeviceId;
  to: NetworkDeviceId;
  segment: L2SegmentId;
};

export type HostConfig = {
  id: HostDeviceId;
  name: string;
  kind: "laptop" | "printer";
  ip: string;
  prefix: string;
  gateway: string;
};

export type RouterConfig = {
  id: "router";
  name: string;
  kind: "router";
  lanIp: string;
  lanPrefix: string;
  wanIp: string;
  wanPrefix: string;
  connectedRoutes: readonly string[];
};

export type NetworkDevice = HostConfig | RouterConfig;

export type NetworkConfig = {
  router: RouterConfig;
  laptop: HostConfig;
  printer: HostConfig;
};

export type IssueCode =
  "invalid-ip" | "invalid-prefix" | "network-address" | "broadcast-address" | "duplicate-address";

export type NetworkValidation = { valid: boolean; issues: IssueCode[] };

export const FIXED_LAN_CIDR = "192.168.1.0/24" as const;
export const FIXED_LAN_IP = "192.168.1.0" as const;
export const FIXED_LAN_PREFIX = "24" as const;
export const ROUTER_LAN_IP = "192.168.1.1" as const;
export const ROUTER_WAN_IP = "203.0.113.1" as const;
export const ROUTER_WAN_CIDR = "203.0.113.0/24" as const;
export const LAPTOP_IP = "192.168.1.10" as const;
export const LAPTOP_GATEWAY = ROUTER_LAN_IP;
export const PRINTER_IP = "192.168.1.30" as const;
export const PRINTER_GATEWAY = ROUTER_LAN_IP;
export const INTERNET_IP = "203.0.113.10" as const;
export const FIXED_SOURCE: HostDeviceId = "laptop";

const ROUTER_NAME = "家庭路由器";
const LAPTOP_NAME = "学习电脑";
const PRINTER_NAME = "打印机";

export const INTERNET_ENDPOINT = {
  id: "internet" as const,
  name: "Internet",
  kind: "internet" as const,
  ip: INTERNET_IP,
  prefix: "24",
};

function createRouterConfig(): RouterConfig {
  return {
    id: "router",
    name: ROUTER_NAME,
    kind: "router",
    lanIp: ROUTER_LAN_IP,
    lanPrefix: FIXED_LAN_PREFIX,
    wanIp: ROUTER_WAN_IP,
    wanPrefix: "24",
    connectedRoutes: [FIXED_LAN_CIDR, ROUTER_WAN_CIDR],
  };
}

function createHostConfig(
  id: HostDeviceId,
  values: Partial<Pick<HostConfig, "ip" | "prefix" | "gateway">> = {},
): HostConfig {
  const defaults =
    id === "laptop"
      ? { name: LAPTOP_NAME, ip: LAPTOP_IP, gateway: LAPTOP_GATEWAY }
      : { name: PRINTER_NAME, ip: PRINTER_IP, gateway: PRINTER_GATEWAY };
  return {
    id,
    name: defaults.name,
    kind: id,
    ip: values.ip ?? defaults.ip,
    prefix: values.prefix ?? "24",
    gateway: values.gateway ?? defaults.gateway,
  };
}

export function createNetworkConfig(
  values: {
    laptop?: Partial<Pick<HostConfig, "ip" | "prefix" | "gateway">>;
    printer?: Partial<Pick<HostConfig, "ip" | "prefix" | "gateway">>;
  } = {},
): NetworkConfig {
  const router = createRouterConfig();
  const laptop = createHostConfig("laptop", values.laptop);
  const printer = createHostConfig("printer", values.printer);
  return { router, laptop, printer };
}

export const DEFAULT_NETWORK_CONFIG = createNetworkConfig();

export const NETWORK_LINKS: readonly NetworkLink[] = [
  { from: "router", to: "laptop", segment: "lan" },
  { from: "router", to: "printer", segment: "lan" },
  { from: "router", to: "internet", segment: "wan" },
];

export const L2_SEGMENTS: readonly L2Segment[] = [
  { id: "lan", name: "Home LAN", members: ["router", "laptop", "printer"] },
  { id: "wan", name: "WAN", members: ["router", "internet"] },
];

export function cloneNetworkConfig(config: NetworkConfig): NetworkConfig {
  const router = { ...config.router, connectedRoutes: [...config.router.connectedRoutes] };
  const laptop = { ...config.laptop };
  const printer = { ...config.printer };
  return { router, laptop, printer };
}

export function parseIpv4(value: string): number | undefined {
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return undefined;
  return octets.reduce((address, octet) => address * 256 + octet, 0);
}

export function formatIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function parseHostPrefix(value: string | number): number | undefined {
  const raw = String(value).trim();
  if (!/^(?:[1-9]|[12]\d|30)$/.test(raw)) return undefined;
  return Number(raw);
}

export function subnetFor(
  ip: string,
  prefix: string | number,
):
  | {
      network: string;
      broadcast: string;
      prefix: number;
    }
  | undefined {
  const address = parseIpv4(ip);
  const parsedPrefix = parseHostPrefix(prefix);
  if (address === undefined || parsedPrefix === undefined) return undefined;
  const mask = (0xffffffff << (32 - parsedPrefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network: formatIpv4(network), broadcast: formatIpv4(broadcast), prefix: parsedPrefix };
}

export function isInSubnet(ip: string, networkIp: string, prefix: string | number): boolean {
  const address = parseIpv4(ip);
  const networkAddress = parseIpv4(networkIp);
  const parsedPrefix = parseHostPrefix(prefix);
  if (address === undefined || networkAddress === undefined || parsedPrefix === undefined) {
    return false;
  }
  const mask = (0xffffffff << (32 - parsedPrefix)) >>> 0;
  return (address & mask) >>> 0 === (networkAddress & mask) >>> 0;
}

export function isOnFixedLan(ip: string): boolean {
  return isInSubnet(ip, FIXED_LAN_IP, FIXED_LAN_PREFIX);
}

export type NeighborResolution =
  | {
      status: "resolved";
      segment: L2SegmentId;
      ip: string;
      deviceId: NetworkDeviceId;
    }
  | {
      status: "unresolved";
      segment: L2SegmentId;
      ip: string;
      reason: "invalid-ip" | "duplicate-address" | "no-neighbor";
    };

function segmentInterfaceIp(
  config: NetworkConfig,
  segment: L2SegmentId,
  deviceId: NetworkDeviceId,
): string | undefined {
  if (deviceId === "router") {
    return segment === "lan" ? config.router.lanIp : config.router.wanIp;
  }
  if (deviceId === "internet") return segment === "wan" ? INTERNET_ENDPOINT.ip : undefined;
  return segment === "lan" ? config[deviceId].ip : undefined;
}

export function resolveNeighbor(
  config: NetworkConfig,
  segment: L2SegmentId,
  ip: string,
): NeighborResolution {
  const address = parseIpv4(ip);
  if (address === undefined) {
    return { status: "unresolved", segment, ip, reason: "invalid-ip" };
  }
  const definition = L2_SEGMENTS.find((candidate) => candidate.id === segment);
  const matches = (definition?.members ?? []).filter((deviceId) => {
    const interfaceIp = segmentInterfaceIp(config, segment, deviceId);
    return interfaceIp !== undefined && parseIpv4(interfaceIp) === address;
  });
  if (matches.length === 1) {
    return { status: "resolved", segment, ip, deviceId: matches[0] };
  }
  return {
    status: "unresolved",
    segment,
    ip,
    reason: matches.length > 1 ? "duplicate-address" : "no-neighbor",
  };
}

export function validateNetwork(config: NetworkConfig): NetworkValidation {
  const issues: IssueCode[] = [];
  const devices = [
    { ip: config.router.lanIp, prefix: config.router.lanPrefix },
    { ip: config.router.wanIp, prefix: config.router.wanPrefix },
    config.laptop,
    config.printer,
  ];
  const parsed = devices.map((device) => ({ device, ip: parseIpv4(device.ip) }));
  if (parsed.some(({ ip }) => ip === undefined)) issues.push("invalid-ip");
  if (devices.some((device) => parseHostPrefix(device.prefix) === undefined)) {
    issues.push("invalid-prefix");
  }
  const addresses = parsed.flatMap(({ ip }) => (ip === undefined ? [] : [ip]));
  if (new Set(addresses).size !== addresses.length) issues.push("duplicate-address");
  parsed.forEach(({ device }) => {
    const subnet = subnetFor(device.ip, device.prefix);
    if (!subnet) return;
    if (subnet.network === device.ip) issues.push("network-address");
    if (subnet.broadcast === device.ip) issues.push("broadcast-address");
  });
  return { valid: issues.length === 0, issues };
}

export type ProbeReasonCode =
  | "address-valid"
  | "invalid-ip"
  | "invalid-prefix"
  | "network-address"
  | "broadcast-address"
  | "duplicate-address"
  | "wrong-endpoint"
  | "destination-local"
  | "destination-remote"
  | "arp-target-resolved"
  | "arp-gateway-resolved"
  | "neighbor-unresolved"
  | "gateway-unresolved"
  | "frame-sent"
  | "direct-delivery"
  | "no-route"
  | "route-to-lan"
  | "route-to-internet"
  | "nat-applied"
  | "wan-frame-sent"
  | "target-replied"
  | "reverse-nat-applied"
  | "reply-delivered"
  | "probe-complete";

export type ProbeEventKind =
  | "address-validation"
  | "destination-classification"
  | "arp-next-hop"
  | "transmit-request"
  | "route-lookup"
  | "nat-request"
  | "target-response"
  | "reverse-nat"
  | "transmit-reply"
  | "probe-complete";

export type ProbeEventOutcome = "pass" | "fail" | "reply" | "complete";

export type NetworkPacket = {
  sourceIp: string;
  destinationIp: string;
  nextHopIp: string;
};

export type ProbeEvent = {
  id: string;
  sequence: number;
  index: number;
  leg: "request" | "reply" | "control";
  actor: NetworkDeviceId;
  hop: string;
  packet: NetworkPacket;
  transformedPacket?: NetworkPacket;
  kind: ProbeEventKind;
  outcome: ProbeEventOutcome;
  reasonCode: ProbeReasonCode;
  reason: string;
};

export type ProbeOutcome = "delivered" | "blocked";

export type ProbeFailure = {
  eventId: string;
  sequence: number;
  kind: ProbeEventKind;
  reasonCode: ProbeReasonCode;
  reason: string;
};

export type ProbeResult = {
  id: string;
  configSnapshot: NetworkConfig;
  source: HostDeviceId;
  target: ProbeTarget;
  events: ProbeEvent[];
  outcome: ProbeOutcome;
  firstFailure?: ProbeFailure;
};

type ProbeParticipant = {
  id: NetworkDeviceId;
  ip: string;
  prefixes: string[];
};

type ParticipantValidation = {
  valid: boolean;
  reasonCode?: Exclude<ProbeReasonCode, "address-valid">;
  reason: string;
};

const REASON_TEXT: Record<ProbeReasonCode, string> = {
  "address-valid": "All path participant addresses and prefixes are valid.",
  "invalid-ip": "A path participant has an invalid IPv4 address.",
  "invalid-prefix": "A path participant has an invalid host prefix; use an integer from /1 to /30.",
  "network-address": "A path participant is using its subnet network address.",
  "broadcast-address": "A path participant is using its subnet broadcast address.",
  "duplicate-address": "Two path participants are configured with the same IPv4 address.",
  "wrong-endpoint": "ARP resolved the address to a different device than the selected endpoint.",
  "destination-local": "The destination is local to the source IP and prefix.",
  "destination-remote": "The destination is outside the source IP and prefix.",
  "arp-target-resolved": "ARP resolved the selected next hop on the egress segment.",
  "arp-gateway-resolved": "ARP resolved the configured router LAN gateway.",
  "neighbor-unresolved": "ARP found no unique device with this address on the segment.",
  "gateway-unresolved": "The configured gateway did not resolve to the router LAN address.",
  "frame-sent": "The LAN frame was transmitted.",
  "direct-delivery": "The reply was delivered directly on the fixed LAN.",
  "no-route": "The router has no connected route for this destination.",
  "route-to-lan": "The router selected its connected LAN route for this destination.",
  "route-to-internet": "The router selected its connected WAN route for this destination.",
  "nat-applied": "The router applied source NAT (SNAT) to the request.",
  "wan-frame-sent": "The translated frame was transmitted on the WAN.",
  "target-replied": "The target replied to the probe.",
  "reverse-nat-applied": "The router reversed the fixed NAT mapping for the reply.",
  "reply-delivered": "The reply reached the laptop.",
  "probe-complete": "The probe completed and the reply reached the source.",
};

function neighborFailureReasonCode(
  resolution: Extract<NeighborResolution, { status: "unresolved" }>,
): "invalid-ip" | "duplicate-address" | "neighbor-unresolved" {
  if (resolution.reason === "invalid-ip") return "invalid-ip";
  if (resolution.reason === "duplicate-address") return "duplicate-address";
  return "neighbor-unresolved";
}

function participantFor(config: NetworkConfig, id: NetworkDeviceId): ProbeParticipant {
  if (id === "router") {
    return {
      id,
      ip: config.router.lanIp,
      prefixes: [config.router.lanPrefix, config.router.wanPrefix],
    };
  }
  if (id === "internet") {
    return { id, ip: INTERNET_ENDPOINT.ip, prefixes: [INTERNET_ENDPOINT.prefix] };
  }
  const device = config[id];
  return { id, ip: device.ip, prefixes: [device.prefix] };
}

function validateProbeParticipant(participant: ProbeParticipant): ParticipantValidation {
  const address = parseIpv4(participant.ip);
  if (address === undefined) {
    return { valid: false, reasonCode: "invalid-ip", reason: REASON_TEXT["invalid-ip"] };
  }
  for (const prefix of participant.prefixes) {
    const parsedPrefix = parseHostPrefix(prefix);
    if (parsedPrefix === undefined) {
      return { valid: false, reasonCode: "invalid-prefix", reason: REASON_TEXT["invalid-prefix"] };
    }
    const subnet = subnetFor(participant.ip, parsedPrefix);
    if (!subnet) {
      return { valid: false, reasonCode: "invalid-prefix", reason: REASON_TEXT["invalid-prefix"] };
    }
    if (subnet.network === participant.ip) {
      return {
        valid: false,
        reasonCode: "network-address",
        reason: REASON_TEXT["network-address"],
      };
    }
    if (subnet.broadcast === participant.ip) {
      return {
        valid: false,
        reasonCode: "broadcast-address",
        reason: REASON_TEXT["broadcast-address"],
      };
    }
  }
  return { valid: true, reason: REASON_TEXT["address-valid"] };
}

function validateProbeParticipants(
  config: NetworkConfig,
  target: ProbeTarget,
): ParticipantValidation {
  const participantIds: NetworkDeviceId[] =
    target === "printer" ? ["router", "laptop", "printer"] : ["laptop", "router"];
  const participants = participantIds.map((id) => participantFor(config, id));
  for (const participant of participants) {
    const validation = validateProbeParticipant(participant);
    if (!validation.valid) return validation;
  }
  const addresses = participants.map(({ ip }) => parseIpv4(ip));
  if (addresses.some((address) => address === undefined)) {
    return { valid: false, reasonCode: "invalid-ip", reason: REASON_TEXT["invalid-ip"] };
  }
  const printerAddress = parseIpv4(config.printer.ip);
  const printerOnLan =
    printerAddress !== undefined &&
    isInSubnet(config.printer.ip, config.router.lanIp, config.router.lanPrefix);
  const lanAddresses =
    target === "internet" && printerOnLan ? [...addresses, printerAddress] : addresses;
  if (new Set(lanAddresses).size !== lanAddresses.length) {
    return {
      valid: false,
      reasonCode: "duplicate-address",
      reason: REASON_TEXT["duplicate-address"],
    };
  }
  return { valid: true, reason: REASON_TEXT["address-valid"] };
}

function packet(sourceIp: string, destinationIp: string, nextHopIp: string): NetworkPacket {
  return { sourceIp, destinationIp, nextHopIp };
}

type ConnectedRouteMatch = {
  route: string;
  prefix: number;
  network: number;
  segment: L2SegmentId;
  interfaceLabel: "router LAN" | "router WAN";
  reasonCode: "route-to-lan" | "route-to-internet";
  nextHopIp: string;
};

function parseConnectedRoute(route: string): { network: number; prefix: number } | undefined {
  const [networkIp, rawPrefix] = route.split("/");
  if (!networkIp || rawPrefix === undefined) return undefined;
  const address = parseIpv4(networkIp);
  const prefix = parseHostPrefix(rawPrefix);
  if (address === undefined || prefix === undefined) return undefined;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (address & mask) >>> 0, prefix };
}

function lookupConnectedRoute(
  router: RouterConfig,
  destinationIp: string,
): ConnectedRouteMatch | undefined {
  const destination = parseIpv4(destinationIp);
  if (destination === undefined) return undefined;
  const lanInterface = parseConnectedRoute(`${router.lanIp}/${router.lanPrefix}`);
  const wanInterface = parseConnectedRoute(`${router.wanIp}/${router.wanPrefix}`);

  return router.connectedRoutes
    .map((route) => {
      const parsed = parseConnectedRoute(route);
      if (!parsed) return undefined;
      const mask = (0xffffffff << (32 - parsed.prefix)) >>> 0;
      if ((destination & mask) >>> 0 !== parsed.network) return undefined;
      if (
        lanInterface &&
        parsed.network === lanInterface.network &&
        parsed.prefix === lanInterface.prefix
      ) {
        return {
          route,
          ...parsed,
          segment: "lan" as const,
          interfaceLabel: "router LAN" as const,
          reasonCode: "route-to-lan" as const,
          nextHopIp: destinationIp,
        };
      }
      if (
        wanInterface &&
        parsed.network === wanInterface.network &&
        parsed.prefix === wanInterface.prefix
      ) {
        return {
          route,
          ...parsed,
          segment: "wan" as const,
          interfaceLabel: "router WAN" as const,
          reasonCode: "route-to-internet" as const,
          nextHopIp: destinationIp,
        };
      }
      return undefined;
    })
    .filter((match): match is ConnectedRouteMatch => match !== undefined)
    .sort((left, right) => right.prefix - left.prefix)[0];
}

type RouterForwardOptions = {
  leg: "request" | "reply";
  expectedNeighbor: NetworkDeviceId;
  resolutionHop: string;
  transmitKind: "transmit-request" | "transmit-reply";
  transmitReasonCode: "frame-sent" | "wan-frame-sent" | "direct-delivery" | "reply-delivered";
  transform?: (routePacket: NetworkPacket, match: ConnectedRouteMatch) => NetworkPacket;
};

type ForwardResult =
  | { status: "delivered"; neighbor: NetworkDeviceId }
  | { status: "blocked"; neighbor?: NetworkDeviceId };

function hashProbeInput(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createProbeId(config: NetworkConfig, target: ProbeTarget, attempt = 0): string {
  return `probe-${hashProbeInput(
    JSON.stringify({ attempt, target, snapshot: cloneNetworkConfig(config) }),
  )}`;
}

export const probeIdFor = createProbeId;

export function cloneProbeEvent(event: ProbeEvent): ProbeEvent {
  return {
    ...event,
    packet: { ...event.packet },
    transformedPacket: event.transformedPacket ? { ...event.transformedPacket } : undefined,
  };
}

export function cloneProbeResult(result: ProbeResult): ProbeResult {
  return {
    ...result,
    configSnapshot: cloneNetworkConfig(result.configSnapshot),
    events: result.events.map(cloneProbeEvent),
    firstFailure: result.firstFailure ? { ...result.firstFailure } : undefined,
  };
}

export function runHomeNetworkProbe(
  config: NetworkConfig,
  target: ProbeTarget,
  source: HostDeviceId = FIXED_SOURCE,
  attempt = 0,
): ProbeResult {
  const snapshot = cloneNetworkConfig(config);
  const normalizedSource: HostDeviceId = source === FIXED_SOURCE ? FIXED_SOURCE : FIXED_SOURCE;
  const sourceDevice = snapshot.laptop;
  const targetDevice = target === "printer" ? snapshot.printer : INTERNET_ENDPOINT;
  const probeId = createProbeId(snapshot, target, attempt);
  const events: ProbeEvent[] = [];
  const addEvent = (event: Omit<ProbeEvent, "id" | "sequence" | "index">): ProbeEvent => {
    const sequence = events.length + 1;
    const completeEvent = {
      ...event,
      id: `${probeId}:event-${sequence}`,
      sequence,
      index: sequence - 1,
    };
    events.push(completeEvent);
    return completeEvent;
  };
  const forwardThroughRouter = (
    inputPacket: NetworkPacket,
    options: RouterForwardOptions,
  ): ForwardResult => {
    const match = lookupConnectedRoute(snapshot.router, inputPacket.destinationIp);
    const routePacket = match
      ? packet(inputPacket.sourceIp, inputPacket.destinationIp, match.nextHopIp)
      : packet(inputPacket.sourceIp, inputPacket.destinationIp, "");
    addEvent({
      leg: options.leg,
      actor: "router",
      hop: match?.interfaceLabel ?? "router",
      packet: routePacket,
      kind: "route-lookup",
      outcome: match ? "pass" : "fail",
      reasonCode: match?.reasonCode ?? "no-route",
      reason: REASON_TEXT[match?.reasonCode ?? "no-route"],
    });
    if (!match) return { status: "blocked" };

    const transmittedPacket = options.transform?.(routePacket, match) ?? routePacket;
    const neighbor = resolveNeighbor(snapshot, match.segment, match.nextHopIp);
    const neighborResolved = neighbor.status === "resolved";
    const neighborReasonCode = neighborResolved
      ? "arp-target-resolved"
      : neighborFailureReasonCode(neighbor);
    addEvent({
      leg: options.leg,
      actor: "router",
      hop: neighborResolved ? neighbor.deviceId : options.resolutionHop,
      packet: transmittedPacket,
      kind: "arp-next-hop",
      outcome: neighborResolved ? "pass" : "fail",
      reasonCode: neighborReasonCode,
      reason: REASON_TEXT[neighborReasonCode],
    });
    if (!neighborResolved) return { status: "blocked" };
    const endpointMatches = neighbor.deviceId === options.expectedNeighbor;
    addEvent({
      leg: options.leg,
      actor: "router",
      hop: neighbor.deviceId,
      packet: transmittedPacket,
      kind: options.transmitKind,
      outcome: endpointMatches ? "pass" : "fail",
      reasonCode: endpointMatches ? options.transmitReasonCode : "wrong-endpoint",
      reason: REASON_TEXT[endpointMatches ? options.transmitReasonCode : "wrong-endpoint"],
    });
    return endpointMatches
      ? { status: "delivered", neighbor: neighbor.deviceId }
      : { status: "blocked", neighbor: neighbor.deviceId };
  };

  const requestPacket = packet(sourceDevice.ip, targetDevice.ip, "");
  const validation = validateProbeParticipants(snapshot, target);
  if (!validation.valid) {
    addEvent({
      leg: "request",
      actor: normalizedSource,
      hop: "path participants",
      packet: requestPacket,
      kind: "address-validation",
      outcome: "fail",
      reasonCode: validation.reasonCode ?? "invalid-ip",
      reason: validation.reason,
    });
    return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
  }

  addEvent({
    leg: "request",
    actor: normalizedSource,
    hop: "path participants",
    packet: requestPacket,
    kind: "address-validation",
    outcome: "pass",
    reasonCode: "address-valid",
    reason: REASON_TEXT["address-valid"],
  });

  const sourcePrefix = parseHostPrefix(sourceDevice.prefix) ?? 24;
  const targetIsLocal = isInSubnet(targetDevice.ip, sourceDevice.ip, sourcePrefix);
  const nextHopIp = targetIsLocal ? targetDevice.ip : sourceDevice.gateway;
  addEvent({
    leg: "request",
    actor: normalizedSource,
    hop: targetIsLocal ? "fixed LAN" : "router gateway",
    packet: packet(sourceDevice.ip, targetDevice.ip, nextHopIp),
    kind: "destination-classification",
    outcome: "pass",
    reasonCode: targetIsLocal ? "destination-local" : "destination-remote",
    reason: REASON_TEXT[targetIsLocal ? "destination-local" : "destination-remote"],
  });

  if (targetIsLocal) {
    const neighbor = resolveNeighbor(snapshot, "lan", targetDevice.ip);
    const neighborResolved = neighbor.status === "resolved";
    const neighborReasonCode = neighborResolved
      ? "arp-target-resolved"
      : neighborFailureReasonCode(neighbor);
    addEvent({
      leg: "request",
      actor: normalizedSource,
      hop: neighborResolved ? neighbor.deviceId : target,
      packet: packet(sourceDevice.ip, targetDevice.ip, targetDevice.ip),
      kind: "arp-next-hop",
      outcome: neighborResolved ? "pass" : "fail",
      reasonCode: neighborReasonCode,
      reason: REASON_TEXT[neighborReasonCode],
    });
    if (!neighborResolved) {
      return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
    }
    if (neighbor.deviceId !== target) {
      addEvent({
        leg: "request",
        actor: normalizedSource,
        hop: neighbor.deviceId,
        packet: packet(sourceDevice.ip, targetDevice.ip, targetDevice.ip),
        kind: "transmit-request",
        outcome: "fail",
        reasonCode: "wrong-endpoint",
        reason: REASON_TEXT["wrong-endpoint"],
      });
      return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
    }
    addEvent({
      leg: "request",
      actor: normalizedSource,
      hop: neighbor.deviceId,
      packet: packet(sourceDevice.ip, targetDevice.ip, targetDevice.ip),
      kind: "transmit-request",
      outcome: "pass",
      reasonCode: "frame-sent",
      reason: REASON_TEXT["frame-sent"],
    });
    const targetPrefix = parseHostPrefix(snapshot.printer.prefix) ?? 24;
    const replyIsLocal = isInSubnet(sourceDevice.ip, snapshot.printer.ip, targetPrefix);
    const replyNextHopIp = replyIsLocal ? sourceDevice.ip : snapshot.printer.gateway;
    addEvent({
      leg: "reply",
      actor: target,
      hop: normalizedSource,
      packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
      kind: "target-response",
      outcome: "reply",
      reasonCode: "target-replied",
      reason: REASON_TEXT["target-replied"],
    });
    addEvent({
      leg: "reply",
      actor: target,
      hop: replyIsLocal ? "fixed LAN" : "printer gateway",
      packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
      kind: "destination-classification",
      outcome: "pass",
      reasonCode: replyIsLocal ? "destination-local" : "destination-remote",
      reason: REASON_TEXT[replyIsLocal ? "destination-local" : "destination-remote"],
    });
    if (!replyIsLocal) {
      const gatewayAddress = parseIpv4(snapshot.printer.gateway);
      const gatewayNeighbor = resolveNeighbor(snapshot, "lan", snapshot.printer.gateway);
      const gatewayResolved =
        gatewayNeighbor.status === "resolved" &&
        gatewayNeighbor.deviceId === "router" &&
        isInSubnet(snapshot.printer.gateway, snapshot.printer.ip, targetPrefix);
      addEvent({
        leg: "reply",
        actor: target,
        hop: "router gateway",
        packet: packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        kind: "arp-next-hop",
        outcome: gatewayResolved ? "pass" : "fail",
        reasonCode: gatewayResolved
          ? "arp-gateway-resolved"
          : gatewayAddress === undefined
            ? "invalid-ip"
            : "gateway-unresolved",
        reason:
          gatewayAddress === undefined
            ? REASON_TEXT["invalid-ip"]
            : REASON_TEXT[gatewayResolved ? "arp-gateway-resolved" : "gateway-unresolved"],
      });
      if (!gatewayResolved) {
        return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
      }
    }
    if (replyIsLocal) {
      addEvent({
        leg: "reply",
        actor: target,
        hop: normalizedSource,
        packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
        kind: "transmit-reply",
        outcome: "pass",
        reasonCode: "direct-delivery",
        reason: REASON_TEXT["direct-delivery"],
      });
    } else {
      addEvent({
        leg: "reply",
        actor: target,
        hop: "router",
        packet: packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        kind: "transmit-reply",
        outcome: "pass",
        reasonCode: "frame-sent",
        reason: REASON_TEXT["frame-sent"],
      });
      const replyForwarded = forwardThroughRouter(
        packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        {
          leg: "reply",
          expectedNeighbor: normalizedSource,
          resolutionHop: normalizedSource,
          transmitKind: "transmit-reply",
          transmitReasonCode: "reply-delivered",
        },
      );
      if (replyForwarded.status === "blocked") {
        return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
      }
    }
    addEvent({
      leg: "control",
      actor: normalizedSource,
      hop: target,
      packet: packet(targetDevice.ip, sourceDevice.ip, sourceDevice.ip),
      kind: "probe-complete",
      outcome: "complete",
      reasonCode: "probe-complete",
      reason: REASON_TEXT["probe-complete"],
    });
    return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
  }

  const gatewayAddress = parseIpv4(sourceDevice.gateway);
  const gatewayNeighbor = resolveNeighbor(snapshot, "lan", sourceDevice.gateway);
  const gatewayResolved =
    gatewayNeighbor.status === "resolved" &&
    gatewayNeighbor.deviceId === "router" &&
    isInSubnet(sourceDevice.gateway, sourceDevice.ip, sourcePrefix);
  addEvent({
    leg: "request",
    actor: normalizedSource,
    hop: "router",
    packet: packet(sourceDevice.ip, targetDevice.ip, sourceDevice.gateway),
    kind: "arp-next-hop",
    outcome: gatewayResolved ? "pass" : "fail",
    reasonCode: gatewayResolved
      ? "arp-gateway-resolved"
      : gatewayAddress === undefined
        ? "invalid-ip"
        : "gateway-unresolved",
    reason:
      gatewayAddress === undefined
        ? REASON_TEXT["invalid-ip"]
        : REASON_TEXT[gatewayResolved ? "arp-gateway-resolved" : "gateway-unresolved"],
  });
  if (!gatewayResolved) return makeProbeResult(probeId, snapshot, normalizedSource, target, events);

  addEvent({
    leg: "request",
    actor: normalizedSource,
    hop: "router LAN",
    packet: packet(sourceDevice.ip, targetDevice.ip, snapshot.router.lanIp),
    kind: "transmit-request",
    outcome: "pass",
    reasonCode: "frame-sent",
    reason: REASON_TEXT["frame-sent"],
  });

  const requestForwarded = forwardThroughRouter(
    packet(sourceDevice.ip, targetDevice.ip, snapshot.router.lanIp),
    target === "internet"
      ? {
          leg: "request",
          expectedNeighbor: target,
          resolutionHop: "Internet",
          transmitKind: "transmit-request",
          transmitReasonCode: "wan-frame-sent",
          transform: (routePacket) => {
            const natAfter = packet(
              snapshot.router.wanIp,
              routePacket.destinationIp,
              routePacket.nextHopIp,
            );
            addEvent({
              leg: "request",
              actor: "router",
              hop: "router WAN",
              packet: routePacket,
              transformedPacket: natAfter,
              kind: "nat-request",
              outcome: "pass",
              reasonCode: "nat-applied",
              reason: REASON_TEXT["nat-applied"],
            });
            return natAfter;
          },
        }
      : {
          leg: "request",
          expectedNeighbor: target,
          resolutionHop: "printer",
          transmitKind: "transmit-request",
          transmitReasonCode: "frame-sent",
        },
  );
  if (requestForwarded.status === "blocked") {
    return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
  }

  if (target === "printer") {
    const targetPrefix = parseHostPrefix(snapshot.printer.prefix) ?? 24;
    const replyIsLocal = isInSubnet(sourceDevice.ip, snapshot.printer.ip, targetPrefix);
    const replyNextHopIp = replyIsLocal ? sourceDevice.ip : snapshot.printer.gateway;
    addEvent({
      leg: "reply",
      actor: target,
      hop: normalizedSource,
      packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
      kind: "target-response",
      outcome: "reply",
      reasonCode: "target-replied",
      reason: REASON_TEXT["target-replied"],
    });
    addEvent({
      leg: "reply",
      actor: target,
      hop: replyIsLocal ? "fixed LAN" : "printer gateway",
      packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
      kind: "destination-classification",
      outcome: "pass",
      reasonCode: replyIsLocal ? "destination-local" : "destination-remote",
      reason: REASON_TEXT[replyIsLocal ? "destination-local" : "destination-remote"],
    });
    if (!replyIsLocal) {
      const gatewayAddress = parseIpv4(snapshot.printer.gateway);
      const gatewayNeighbor = resolveNeighbor(snapshot, "lan", snapshot.printer.gateway);
      const gatewayResolved =
        gatewayNeighbor.status === "resolved" &&
        gatewayNeighbor.deviceId === "router" &&
        isInSubnet(snapshot.printer.gateway, snapshot.printer.ip, targetPrefix);
      addEvent({
        leg: "reply",
        actor: target,
        hop: "router gateway",
        packet: packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        kind: "arp-next-hop",
        outcome: gatewayResolved ? "pass" : "fail",
        reasonCode: gatewayResolved
          ? "arp-gateway-resolved"
          : gatewayAddress === undefined
            ? "invalid-ip"
            : "gateway-unresolved",
        reason:
          gatewayAddress === undefined
            ? REASON_TEXT["invalid-ip"]
            : REASON_TEXT[gatewayResolved ? "arp-gateway-resolved" : "gateway-unresolved"],
      });
      if (!gatewayResolved) {
        return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
      }
      addEvent({
        leg: "reply",
        actor: target,
        hop: "router",
        packet: packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        kind: "transmit-reply",
        outcome: "pass",
        reasonCode: "frame-sent",
        reason: REASON_TEXT["frame-sent"],
      });
      const replyForwarded = forwardThroughRouter(
        packet(targetDevice.ip, sourceDevice.ip, snapshot.printer.gateway),
        {
          leg: "reply",
          expectedNeighbor: normalizedSource,
          resolutionHop: normalizedSource,
          transmitKind: "transmit-reply",
          transmitReasonCode: "reply-delivered",
        },
      );
      if (replyForwarded.status === "blocked") {
        return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
      }
    } else {
      addEvent({
        leg: "reply",
        actor: target,
        hop: normalizedSource,
        packet: packet(targetDevice.ip, sourceDevice.ip, replyNextHopIp),
        kind: "transmit-reply",
        outcome: "pass",
        reasonCode: "direct-delivery",
        reason: REASON_TEXT["direct-delivery"],
      });
    }
    addEvent({
      leg: "control",
      actor: normalizedSource,
      hop: target,
      packet: packet(targetDevice.ip, sourceDevice.ip, sourceDevice.ip),
      kind: "probe-complete",
      outcome: "complete",
      reasonCode: "probe-complete",
      reason: REASON_TEXT["probe-complete"],
    });
    return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
  }

  const replyBefore = packet(targetDevice.ip, snapshot.router.wanIp, "");
  addEvent({
    leg: "reply",
    actor: "internet",
    hop: "router WAN",
    packet: replyBefore,
    kind: "target-response",
    outcome: "reply",
    reasonCode: "target-replied",
    reason: REASON_TEXT["target-replied"],
  });
  const replyAfter = packet(targetDevice.ip, sourceDevice.ip, "");
  addEvent({
    leg: "reply",
    actor: "router",
    hop: "router LAN",
    packet: replyBefore,
    transformedPacket: replyAfter,
    kind: "reverse-nat",
    outcome: "pass",
    reasonCode: "reverse-nat-applied",
    reason: REASON_TEXT["reverse-nat-applied"],
  });
  const replyForwarded = forwardThroughRouter(replyAfter, {
    leg: "reply",
    expectedNeighbor: normalizedSource,
    resolutionHop: normalizedSource,
    transmitKind: "transmit-reply",
    transmitReasonCode: "reply-delivered",
  });
  if (replyForwarded.status === "blocked") {
    return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
  }
  addEvent({
    leg: "control",
    actor: normalizedSource,
    hop: "Internet",
    packet: replyAfter,
    kind: "probe-complete",
    outcome: "complete",
    reasonCode: "probe-complete",
    reason: REASON_TEXT["probe-complete"],
  });
  return makeProbeResult(probeId, snapshot, normalizedSource, target, events);
}

export const probeNetwork = runHomeNetworkProbe;
export const simulateHomeNetworkProbe = runHomeNetworkProbe;

function makeProbeResult(
  id: string,
  configSnapshot: NetworkConfig,
  source: HostDeviceId,
  target: ProbeTarget,
  events: ProbeEvent[],
): ProbeResult {
  const firstFailedEvent = events.find((event) => event.outcome === "fail");
  return {
    id,
    configSnapshot: cloneNetworkConfig(configSnapshot),
    source,
    target,
    events: events.map(cloneProbeEvent),
    outcome: firstFailedEvent ? "blocked" : "delivered",
    firstFailure: firstFailedEvent
      ? {
          eventId: firstFailedEvent.id,
          sequence: firstFailedEvent.sequence,
          kind: firstFailedEvent.kind,
          reasonCode: firstFailedEvent.reasonCode,
          reason: firstFailedEvent.reason,
        }
      : undefined,
  };
}

export function reasonText(reasonCode: ProbeReasonCode): string {
  return REASON_TEXT[reasonCode];
}

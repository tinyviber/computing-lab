import type { LabDefinition } from "./types";

/**
 * Lab registry and feature flags.
 *
 * Only `enabled` labs appear in navigation and open for students. The earlier
 * exploratory labs stay in the codebase and keep their routes; they are hidden,
 * not deleted, and remain reachable for teachers or with
 * `?showExperimentalLabs=1`.
 */
export const labs: LabDefinition[] = [
  {
    id: "calculator",
    title: "实现ALU",
    category: "计算机原理",
    route: "/labs/calculator",
    description: "从半加器到完整计算器：用逻辑门逐关搭出运算电路。",
    status: "available",
    enabled: true,
  },
  {
    id: "image-encoding",
    title: "图像编码",
    category: "信息编码",
    route: "/labs/image-encoding",
    description: "采样、量化、重建图像与数据量。",
    status: "available",
    enabled: false,
  },
  {
    id: "audio-encoding",
    title: "声音编码",
    category: "信息编码",
    route: "/labs/audio-encoding",
    description: "采样率、量化位数与混叠。",
    status: "available",
    enabled: false,
  },
  {
    id: "home-network",
    title: "家庭网络配置",
    category: "网络",
    route: "/labs/home-network",
    description: "连接设备、配置网关，排查家庭网络故障。",
    status: "available",
    enabled: false,
  },
  {
    id: "twos-complement",
    title: "二进制补码",
    category: "数据表示",
    route: "/labs/twos-complement",
    description: "固定宽度整数、逐位进位与有符号溢出。",
    status: "available",
    enabled: false,
  },
  {
    id: "program-execution",
    title: "程序执行",
    category: "程序设计",
    route: "/labs/program-execution",
    description: "变量、循环条件与输出。",
    status: "available",
    enabled: false,
  },
  {
    id: "protocol-process",
    title: "协议过程",
    category: "协议过程",
    route: "/labs/protocol-process",
    description: "延迟、丢失、超时、重试与确认。",
    status: "available",
    enabled: false,
  },
  {
    id: "utf8",
    title: "UTF-8 编码",
    category: "信息编码",
    route: "/labs/utf8",
    description: "Unicode 码点与 UTF-8 字节数。",
    status: "available",
    enabled: false,
  },
  {
    id: "monte-carlo",
    title: "蒙特卡洛求 π",
    category: "随机与模拟",
    route: "/labs/monte-carlo",
    description: "随机点、样本量与 π 估计。",
    status: "available",
    enabled: false,
  },
  {
    id: "relational-data",
    title: "关系数据",
    category: "数据查询",
    route: "/labs/relational-data",
    description: "查询、约束、派生计数与来源行。",
    status: "available",
    enabled: false,
  },
  {
    id: "byte-edit",
    title: "字节编辑",
    category: "信息编码",
    route: "/labs/byte-edit",
    description: "单字节修改与 UTF-8 有效性。",
    status: "available",
    enabled: false,
  },
];

export function getLab(id: string): LabDefinition | undefined {
  return labs.find((lab) => lab.id === id);
}

export function enabledLabs(): LabDefinition[] {
  return labs.filter((lab) => lab.enabled);
}

/** Labs kept in the codebase but hidden from the default classroom flow. */
export function experimentalLabs(): LabDefinition[] {
  return labs.filter((lab) => !lab.enabled);
}

/**
 * Which labs a viewer may navigate to. Teachers and the explicit escape hatch
 * see everything; students see only enabled labs.
 */
export function visibleLabs(options: {
  role?: "student" | "teacher" | null;
  showExperimental?: boolean;
}): LabDefinition[] {
  if (options.role === "teacher" || options.showExperimental) return labs;
  return enabledLabs();
}

export function isLabAccessible(
  id: string,
  options: { role?: "student" | "teacher" | null; showExperimental?: boolean },
): boolean {
  const lab = getLab(id);
  if (!lab) return false;
  return lab.enabled || options.role === "teacher" || options.showExperimental === true;
}

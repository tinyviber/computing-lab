import type { LabDefinition } from "./types";

export const labs: LabDefinition[] = [
  {
    id: "image-encoding",
    title: "图像编码",
    category: "信息编码",
    route: "/labs/image-encoding",
    description: "观察采样与量化如何影响图像和数据量。",
    status: "available",
  },
  {
    id: "audio-encoding",
    title: "声音编码",
    category: "信息编码",
    route: "/labs/audio-encoding",
    description: "观察采样率和量化位数如何描述声音。",
    status: "available",
  },
  {
    id: "home-network",
    title: "家庭网络配置",
    category: "网络",
    route: "/labs/home-network",
    description: "连接设备、配置网关，排查家庭网络故障。",
    status: "available",
  },
  {
    id: "twos-complement",
    title: "二进制补码",
    category: "数据表示",
    route: "/labs/twos-complement",
    description: "观察固定宽度 word、ripple carry 与 signed overflow 的不同证据。",
    status: "available",
  },
  {
    id: "program-execution",
    title: "程序执行",
    category: "程序设计",
    route: "/labs/program-execution",
    description: "逐步观察变量、循环条件与输出如何形成。",
    status: "available",
  },
  {
    id: "protocol-process",
    title: "协议过程",
    category: "协议过程",
    route: "/labs/protocol-process",
    description: "观察延迟、丢失、超时、重试与确认如何形成可靠传递。",
    status: "available",
  },
  {
    id: "utf8",
    title: "UTF-8 编码",
    category: "信息编码",
    route: "/labs/utf8",
    description: "观察 Unicode 码点如何按范围变成不同数量的 UTF-8 字节。",
    status: "available",
  },
];

export function getLab(id: string): LabDefinition | undefined {
  return labs.find((lab) => lab.id === id);
}

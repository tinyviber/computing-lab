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
];

export function getLab(id: string): LabDefinition | undefined {
  return labs.find((lab) => lab.id === id);
}

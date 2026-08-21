import type { LabDefinition } from "./types";

export const labs: LabDefinition[] = [
  {
    id: "image-encoding",
    title: "图像编码",
    category: "信息编码",
    route: "/labs/image-encoding",
    description: "采样、量化、重建图像与数据量。",
    status: "available",
  },
  {
    id: "audio-encoding",
    title: "声音编码",
    category: "信息编码",
    route: "/labs/audio-encoding",
    description: "采样率、量化位数与混叠。",
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
    description: "固定宽度整数、逐位进位与有符号溢出。",
    status: "available",
  },
  {
    id: "program-execution",
    title: "程序执行",
    category: "程序设计",
    route: "/labs/program-execution",
    description: "变量、循环条件与输出。",
    status: "available",
  },
  {
    id: "protocol-process",
    title: "协议过程",
    category: "协议过程",
    route: "/labs/protocol-process",
    description: "延迟、丢失、超时、重试与确认。",
    status: "available",
  },
  {
    id: "utf8",
    title: "UTF-8 编码",
    category: "信息编码",
    route: "/labs/utf8",
    description: "Unicode 码点与 UTF-8 字节数。",
    status: "available",
  },
  {
    id: "monte-carlo",
    title: "蒙特卡洛求 π",
    category: "随机与模拟",
    route: "/labs/monte-carlo",
    description: "随机点、样本量与 π 估计。",
    status: "available",
  },
  {
    id: "relational-data",
    title: "关系数据",
    category: "数据查询",
    route: "/labs/relational-data",
    description: "查询、约束、派生计数与来源行。",
    status: "available",
  },
  {
    id: "byte-edit",
    title: "字节编辑",
    category: "信息编码",
    route: "/labs/byte-edit",
    description: "单字节修改与 UTF-8 有效性。",
    status: "available",
  },
];

export function getLab(id: string): LabDefinition | undefined {
  return labs.find((lab) => lab.id === id);
}

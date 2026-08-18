export type LabCategory = "信息编码" | "网络" | "数据表示" | "程序设计" | "协议过程";

export type LabDefinition = {
  id: string;
  title: string;
  category: LabCategory;
  route: string;
  description: string;
  status: "available" | "preview";
};

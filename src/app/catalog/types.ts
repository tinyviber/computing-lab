export type LabCategory = "信息编码" | "网络";

export type LabDefinition = {
  id: string;
  title: string;
  category: LabCategory;
  route: string;
  description: string;
  status: "available" | "preview";
};

export type LabCategory =
  | "信息编码"
  | "网络"
  | "数据表示"
  | "程序设计"
  | "协议过程"
  | "随机与模拟"
  | "数据查询"
  | "计算机原理";

export type LabDefinition = {
  id: string;
  title: string;
  category: LabCategory;
  route: string;
  description: string;
  status: "available" | "preview";
  /**
   * Feature flag. A disabled lab keeps all of its code and route but is hidden
   * from navigation and refuses to render for students. Teachers, and anyone
   * passing `?showExperimentalLabs=1`, may still open it.
   */
  enabled: boolean;
};

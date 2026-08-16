import type { ReactNode } from "react";

export type LabCategory = "信息编码" | "网络";

export type LabDefinition = {
  id: string;
  title: string;
  category: LabCategory;
  route: string;
  description: string;
  status: "available" | "preview";
};

export type LabShellSlots = {
  navigation?: ReactNode;
  visualization?: ReactNode;
  controls?: ReactNode;
  explanation?: ReactNode;
  actions?: ReactNode;
};

export type ScenarioPreset<T extends string = string> = {
  id: T;
  label: string;
  description: string;
};

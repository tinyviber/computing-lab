import { createContext, useContext, type ReactNode } from "react";

export type LabNavigationItem = {
  id: string;
  title: string;
  category: string;
  route: string;
  status: "available" | "preview";
};

const LabNavigationContext = createContext<readonly LabNavigationItem[]>([]);

type LabNavigationProviderProps = {
  labs: readonly LabNavigationItem[];
  children: ReactNode;
};

export function LabNavigationProvider({ labs, children }: LabNavigationProviderProps) {
  return <LabNavigationContext.Provider value={labs}>{children}</LabNavigationContext.Provider>;
}

export function useLabNavigationItems() {
  return useContext(LabNavigationContext);
}

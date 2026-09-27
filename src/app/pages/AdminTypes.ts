export type AdminClass = { id: string; name: string; inviteCode: string; memberCount: number };

type ImportRowResult = {
  line: number;
  studentNo: string;
  status: "created" | "exists" | "error";
  error?: string;
};

export type ImportSummary = {
  created: number;
  exists: number;
  failed: number;
  rows: ImportRowResult[];
};

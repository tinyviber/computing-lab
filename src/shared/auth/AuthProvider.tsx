import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";

/** Account-level role: admin ⊃ teacher ⊃ user. */
export type AccountRole = "admin" | "teacher" | "user";

/** Per-class membership role, assigned by an admin when provisioning accounts. */
export type LabRole = "student" | "teacher";

export type Membership = { classId: string; className: string; role: LabRole };

export type AuthUser = { id: string; studentNo: string; name: string; role: AccountRole };

export type AuthSession = { user: AuthUser; memberships: Membership[] };

export type AuthState =
  | { status: "loading"; session: null }
  | { status: "anonymous"; session: null }
  | { status: "authenticated"; session: AuthSession };

export type AuthContextValue = AuthState & {
  /** Primary class for the classroom flow (first membership). */
  primaryMembership: Membership | null;
  /** The signed-in account's global role. */
  role: AccountRole | null;
  login: (input: { studentNo: string; password: string }) => Promise<void>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function isStaffRole(role: AccountRole | null | undefined): boolean {
  return role === "teacher" || role === "admin";
}

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: "管理员",
  teacher: "教师",
  user: "学生",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  /** Tests inject a resolved state to skip the network round trip. */
  initialState?: AuthState;
}) {
  const [state, setState] = useState<AuthState>(
    initialState ?? { status: "loading", session: null },
  );

  const refresh = useCallback(async () => {
    try {
      const session = await api.get<AuthSession>("/api/auth/me");
      setState({ status: "authenticated", session });
    } catch {
      setState({ status: "anonymous", session: null });
    }
  }, []);

  useEffect(() => {
    if (initialState) return;
    void refresh();
  }, [initialState, refresh]);

  const login = useCallback(async (input: { studentNo: string; password: string }) => {
    const session = await api.post<AuthSession>("/api/auth/login", input);
    setState({ status: "authenticated", session });
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setState({ status: "anonymous", session: null });
  }, []);

  const changePassword = useCallback(
    async (input: { currentPassword: string; newPassword: string }) => {
      await api.post("/api/auth/change-password", input);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(() => {
    const primaryMembership = state.session?.memberships[0] ?? null;
    return {
      ...state,
      primaryMembership,
      role: state.session?.user.role ?? null,
      login,
      changePassword,
      logout,
      refresh,
    };
  }, [state, login, changePassword, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

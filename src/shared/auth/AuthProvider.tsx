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

export type LabRole = "student" | "teacher";

export type Membership = { classId: string; className: string; role: LabRole };

export type AuthUser = { id: string; studentNo: string; name: string };

export type AuthSession = { user: AuthUser; memberships: Membership[] };

export type AuthState =
  | { status: "loading"; session: null }
  | { status: "anonymous"; session: null }
  | { status: "authenticated"; session: AuthSession };

export type AuthContextValue = AuthState & {
  /** Primary class for the classroom flow (first membership). */
  primaryMembership: Membership | null;
  role: LabRole | null;
  login: (input: { studentNo: string; password: string }) => Promise<void>;
  join: (input: {
    inviteCode: string;
    studentNo: string;
    name: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
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

  const join = useCallback(
    async (input: { inviteCode: string; studentNo: string; name: string; password: string }) => {
      const session = await api.post<AuthSession>("/api/auth/join", input);
      setState({ status: "authenticated", session });
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setState({ status: "anonymous", session: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const primaryMembership = state.session?.memberships[0] ?? null;
    return {
      ...state,
      primaryMembership,
      role: primaryMembership?.role ?? null,
      login,
      join,
      logout,
      refresh,
    };
  }, [state, login, join, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

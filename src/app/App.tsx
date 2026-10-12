import { RouterProvider, useRouterState } from "@tanstack/react-router";
import { AuthProvider, type AuthState } from "../shared/auth";
import { router } from "./router";

const previewAuth: AuthState = { status: "anonymous", session: null };

export default function App() {
  const pathname = useRouterState({ router, select: (state) => state.location.pathname });
  // No auth request in fixed dev previews. Leaving the route resumes normal refresh.
  const preview = import.meta.env.DEV && pathname.endsWith("/__dev/labs/cpu");
  return (
    <AuthProvider initialState={preview ? previewAuth : undefined}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

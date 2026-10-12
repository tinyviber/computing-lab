import { RouterProvider, useRouterState } from "@tanstack/react-router";
import { AuthProvider, type AuthState } from "../shared/auth";
import { router } from "./router";

const previewAuth: AuthState = { status: "anonymous", session: null };

export default function App() {
  const pathname = useRouterState({ router, select: (state) => state.location.pathname });
  // Dev previews fire no auth request from the outer provider either.
  // Isolation itself lives in the shell's PreviewAuthBoundary — this only
  // skips the fetch; the provider's mount-time state can no longer leak
  // into preview content. Leaving the route resumes normal refresh.
  const preview = import.meta.env.DEV && pathname.includes("/__dev/labs/");
  return (
    <AuthProvider initialState={preview ? previewAuth : undefined}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

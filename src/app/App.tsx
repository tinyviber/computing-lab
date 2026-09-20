import { RouterProvider } from "@tanstack/react-router";
import { useSyncExternalStore, type ReactNode } from "react";
import { LabNavigationProvider } from "../shared/lab/LabNavigationProvider";
import { AuthProvider, useAuth } from "../shared/auth";
import { visibleLabs } from "./catalog/labs";
import { router } from "./router";

/**
 * Navigation reflects the feature flags: teachers and students see enabled
 * labs only, while admins and the `?showExperimentalLabs=1` escape hatch see
 * all of them. The flag is read from the router so it reacts to client-side
 * navigation.
 */
function VisibleLabNavigation({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const flag = useSyncExternalStore(
    (onStoreChange) => router.subscribe("onResolved", onStoreChange),
    () => router.state.location.search.showExperimentalLabs,
  );
  const showExperimental = flag === "1" || flag === 1 || flag === true;
  return (
    <LabNavigationProvider labs={visibleLabs({ role, showExperimental })}>
      {children}
    </LabNavigationProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VisibleLabNavigation>
        <RouterProvider router={router} />
      </VisibleLabNavigation>
    </AuthProvider>
  );
}

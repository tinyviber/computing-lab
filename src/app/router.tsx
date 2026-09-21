import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { CalculatorLabPage } from "../features/calculator";
import { ImageSamplingLabPage } from "../features/image-sampling";
import { HomePage } from "./pages/HomePage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { CalculatorRedirectPage } from "./pages/CalculatorRedirectPage";
import { ImageSamplingRedirectPage } from "./pages/ImageSamplingRedirectPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";

function RootLayout() {
  return <Outlet />;
}

function normalizeBasePath(baseUrl: string): string {
  const pathname = baseUrl.split("?")[0].split("#")[0] || "/";
  if (pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
}

function resolveRuntimeBasePath(configuredBasePath: string): string {
  if (configuredBasePath === "/" || typeof window === "undefined") return configuredBasePath;
  const pathname = window.location.pathname;
  const isConfiguredPath =
    pathname === configuredBasePath || pathname.startsWith(`${configuredBasePath}/`);
  return isConfiguredPath ? configuredBasePath : "/";
}

const configuredBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export type AppRouterOptions = {
  history?: RouterHistory;
  basepath?: string;
};

export const passThroughSearch = (search: Record<string, unknown>): Record<string, unknown> =>
  search;

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfilePage,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

/** Public entry point; forwards a signed-in member to their own class. */
const calculatorEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/calculator",
  component: CalculatorRedirectPage,
  errorComponent: LabErrorPage,
});

const calculatorLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/calculator",
  validateSearch: passThroughSearch,
  component: CalculatorLabPage,
  errorComponent: LabErrorPage,
});

/** Admin preview: the page itself turns teachers away. */
const imageSamplingEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/image-sampling",
  component: ImageSamplingRedirectPage,
  errorComponent: LabErrorPage,
});

const imageSamplingLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/image-sampling",
  validateSearch: passThroughSearch,
  component: ImageSamplingLabPage,
  errorComponent: LabErrorPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/dashboard",
  validateSearch: passThroughSearch,
  component: TeacherDashboardPage,
  errorComponent: LabErrorPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  profileRoute,
  adminRoute,
  calculatorEntryRoute,
  calculatorLabRoute,
  imageSamplingEntryRoute,
  imageSamplingLabRoute,
  dashboardRoute,
]);

export function createAppRouter({
  history = createBrowserHistory(),
  basepath = resolveRuntimeBasePath(configuredBasePath),
}: AppRouterOptions = {}) {
  return createRouter({ history, basepath, defaultPreload: "intent", routeTree });
}

export const router = createAppRouter();

export { normalizeBasePath, resolveRuntimeBasePath };

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

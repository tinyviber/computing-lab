import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { normalizeBasePath } from "../shared/basePath";
import { CalculatorLabPage } from "../features/calculator";
import { HomePage } from "./pages/HomePage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { CalculatorRedirectPage } from "./pages/CalculatorRedirectPage";
import { ImageSamplingRedirectPage } from "./pages/ImageSamplingRedirectPage";
import { ColorQuantizationRedirectPage } from "./pages/ColorQuantizationRedirectPage";
import { CpuRedirectPage } from "./pages/CpuRedirectPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { StudentLabPreviewPage } from "./pages/StudentLabPreviewPage";
import { TaskSheetListPage } from "./pages/TaskSheetListPage";
import { TaskAssignmentPage } from "./pages/TaskAssignmentPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";

function RootLayout() {
  return <Outlet />;
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
  // Lazy: keeps the CodeMirror editor + lab UI out of the main bundle.
  component: lazyRouteComponent(() => import("../features/image-sampling"), "ImageSamplingLabPage"),
  errorComponent: LabErrorPage,
});

/** Admin preview: the page itself turns teachers away. */
const colorQuantizationEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/color-quantization",
  component: ColorQuantizationRedirectPage,
  errorComponent: LabErrorPage,
});

const colorQuantizationLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/color-quantization",
  validateSearch: passThroughSearch,
  // Lazy: keeps the CodeMirror editor + lab UI out of the main bundle.
  component: lazyRouteComponent(
    () => import("../features/color-quantization"),
    "ColorQuantizationLabPage",
  ),
  errorComponent: LabErrorPage,
});

const cpuEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/cpu",
  component: CpuRedirectPage,
  errorComponent: LabErrorPage,
});

const cpuLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/cpu",
  validateSearch: passThroughSearch,
  component: lazyRouteComponent(() => import("../features/cpu"), "CpuLabPage"),
  errorComponent: LabErrorPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/dashboard",
  validateSearch: passThroughSearch,
  component: TeacherDashboardPage,
  errorComponent: LabErrorPage,
});

/**
 * Admin-only replay of a student's calculator lab — deliberately separate
 * from the student's own /classes/$classId/labs/calculator route so a
 * preview URL can never be mistaken for (or overwrite) the real thing.
 */
const studentLabPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/students/$userId/labs/calculator",
  validateSearch: passThroughSearch,
  component: StudentLabPreviewPage,
  errorComponent: LabErrorPage,
});

const taskSheetListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TaskSheetListPage,
  errorComponent: LabErrorPage,
});

const taskSheetEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$sheetId/edit",
  // Lazy: the editor stays out of the student-facing main bundle.
  component: lazyRouteComponent(() => import("./pages/TaskSheetEditorPage"), "TaskSheetEditorPage"),
  errorComponent: LabErrorPage,
});

const taskAssignmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/tasks/$assignmentId",
  component: TaskAssignmentPage,
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
  colorQuantizationEntryRoute,
  colorQuantizationLabRoute,
  cpuEntryRoute,
  cpuLabRoute,
  dashboardRoute,
  studentLabPreviewRoute,
  taskSheetListRoute,
  taskSheetEditorRoute,
  taskAssignmentRoute,
]);

export function createAppRouter({
  history = createBrowserHistory(),
  basepath = resolveRuntimeBasePath(configuredBasePath),
}: AppRouterOptions = {}) {
  return createRouter({ history, basepath, defaultPreload: "intent", routeTree });
}

export const router = createAppRouter();

export { normalizeBasePath, resolveRuntimeBasePath };
export { basePathPrefix } from "../shared/basePath";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

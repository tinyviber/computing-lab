import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import type { ComponentType } from "react";
import { AudioEncodingPage } from "../features/audio-encoding";
import { ByteEditPage } from "../features/byte-edit";
import { CalculatorLabPage } from "../features/calculator";
import { HomeNetworkPage } from "../features/home-network";
import { ImageEncodingPage } from "../features/image-encoding";
import { MonteCarloPage } from "../features/monte-carlo";
import { NumberConversionPage } from "../features/number-conversion";
import { ProgramExecutionPage } from "../features/program-execution";
import { ProtocolProcessPage } from "../features/protocol-process";
import { RelationalDataPage } from "../features/relational-data";
import { TwosComplementPage } from "../features/twos-complement";
import { Utf8Page } from "../features/utf8";
import { getLab } from "./catalog/labs";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LabGate } from "./pages/LabGate";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { CalculatorRedirectPage } from "./pages/CalculatorRedirectPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";

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
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  component: EditorPage,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

/**
 * Wrap a legacy lab page in its feature flag gate. The page component and its
 * route stay registered; the gate decides whether a viewer may see it.
 */
function gatedLab(labId: string, Page: ComponentType) {
  const lab = getLab(labId);
  return function GatedLabRoute() {
    return (
      <LabGate labId={labId} title={lab?.title ?? "该实验"}>
        <Page />
      </LabGate>
    );
  };
}

// `Path` stays generic so each route keeps its literal path in the router type.
function legacyLabRoute<Path extends string>(labId: string, path: Path, Page: ComponentType) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: passThroughSearch,
    component: gatedLab(labId, Page),
    errorComponent: LabErrorPage,
  });
}

const imageRoute = legacyLabRoute("image-encoding", "/labs/image-encoding", ImageEncodingPage);
const audioRoute = legacyLabRoute("audio-encoding", "/labs/audio-encoding", AudioEncodingPage);
const networkRoute = legacyLabRoute("home-network", "/labs/home-network", HomeNetworkPage);
const twosComplementRoute = legacyLabRoute(
  "twos-complement",
  "/labs/twos-complement",
  TwosComplementPage,
);
const programExecutionRoute = legacyLabRoute(
  "program-execution",
  "/labs/program-execution",
  ProgramExecutionPage,
);
const protocolProcessRoute = legacyLabRoute(
  "protocol-process",
  "/labs/protocol-process",
  ProtocolProcessPage,
);
const utf8Route = legacyLabRoute("utf8", "/labs/utf8", Utf8Page);
const monteCarloRoute = legacyLabRoute("monte-carlo", "/labs/monte-carlo", MonteCarloPage);
const numberConversionRoute = legacyLabRoute(
  "number-conversion",
  "/labs/number-conversion",
  NumberConversionPage,
);
const relationalDataRoute = legacyLabRoute(
  "relational-data",
  "/labs/relational-data",
  RelationalDataPage,
);
const byteEditRoute = legacyLabRoute("byte-edit", "/labs/byte-edit", ByteEditPage);

/** Catalog-shaped entry point; forwards to the viewer's own class. */
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
  calculatorEntryRoute,
  calculatorLabRoute,
  dashboardRoute,
  editorRoute,
  imageRoute,
  audioRoute,
  networkRoute,
  twosComplementRoute,
  programExecutionRoute,
  protocolProcessRoute,
  utf8Route,
  monteCarloRoute,
  numberConversionRoute,
  relationalDataRoute,
  byteEditRoute,
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

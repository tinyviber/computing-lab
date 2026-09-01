import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { AudioEncodingPage } from "../features/audio-encoding";
import { ByteEditPage } from "../features/byte-edit";
import { HomeNetworkPage } from "../features/home-network";
import { ImageEncodingPage } from "../features/image-encoding";
import { MonteCarloPage } from "../features/monte-carlo";
import { ProgramExecutionPage } from "../features/program-execution";
import { ProtocolProcessPage } from "../features/protocol-process";
import { RelationalDataPage } from "../features/relational-data";
import { TwosComplementPage } from "../features/twos-complement";
import { Utf8Page } from "../features/utf8";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { NotFoundPage } from "./pages/NotFoundPage";

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
const imageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/image-encoding",
  validateSearch: passThroughSearch,
  component: ImageEncodingPage,
  errorComponent: LabErrorPage,
});
const audioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/audio-encoding",
  validateSearch: passThroughSearch,
  component: AudioEncodingPage,
  errorComponent: LabErrorPage,
});
const networkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/home-network",
  validateSearch: passThroughSearch,
  component: HomeNetworkPage,
  errorComponent: LabErrorPage,
});
const twosComplementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/twos-complement",
  validateSearch: passThroughSearch,
  component: TwosComplementPage,
  errorComponent: LabErrorPage,
});
const programExecutionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/program-execution",
  validateSearch: passThroughSearch,
  component: ProgramExecutionPage,
  errorComponent: LabErrorPage,
});
const protocolProcessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/protocol-process",
  validateSearch: passThroughSearch,
  component: ProtocolProcessPage,
  errorComponent: LabErrorPage,
});
const utf8Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/utf8",
  validateSearch: passThroughSearch,
  component: Utf8Page,
  errorComponent: LabErrorPage,
});
const monteCarloRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/monte-carlo",
  validateSearch: passThroughSearch,
  component: MonteCarloPage,
  errorComponent: LabErrorPage,
});
const relationalDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/relational-data",
  validateSearch: passThroughSearch,
  component: RelationalDataPage,
  errorComponent: LabErrorPage,
});
const byteEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/byte-edit",
  validateSearch: passThroughSearch,
  component: ByteEditPage,
  errorComponent: LabErrorPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  editorRoute,
  imageRoute,
  audioRoute,
  networkRoute,
  twosComplementRoute,
  programExecutionRoute,
  protocolProcessRoute,
  utf8Route,
  monteCarloRoute,
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

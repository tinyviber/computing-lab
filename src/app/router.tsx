import {
  Link,
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { HomePage } from "../pages/HomePage";
import { AudioEncodingPage } from "../features/audio-encoding/ui/AudioEncodingPage";
import { HomeNetworkPage } from "../features/home-network/ui/HomeNetworkPage";
import { ImageEncodingPage } from "../features/image-encoding/ui/ImageEncodingPage";

function RootLayout() {
  return <Outlet />;
}

function NotFoundPage() {
  return (
    <div className="not-found">
      <p className="eyebrow">404 / ROUTE NOT FOUND</p>
      <h1>实验不存在</h1>
      <p>这个地址没有对应的 Computing Lab 实验。</p>
      <Link className="button button-primary" to="/">
        返回首页
      </Link>
    </div>
  );
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
const imageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/image-encoding",
  validateSearch: passThroughSearch,
  component: ImageEncodingPage,
});
const audioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/audio-encoding",
  validateSearch: passThroughSearch,
  component: AudioEncodingPage,
});
const networkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/home-network",
  validateSearch: passThroughSearch,
  component: HomeNetworkPage,
});

const routeTree = rootRoute.addChildren([indexRoute, imageRoute, audioRoute, networkRoute]);

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

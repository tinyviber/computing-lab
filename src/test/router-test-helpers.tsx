import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { LabNavigationProvider } from "../shared/lab/LabNavigationProvider";
import { createAppRouter } from "../app/router";
import { labs } from "../app/catalog/labs";

export async function renderAppAt(initialEntry: string, basepath = "/") {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createAppRouter({ history, basepath });
  const rendered = render(
    <LabNavigationProvider labs={labs}>
      <RouterProvider router={router} />
    </LabNavigationProvider>,
  );

  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));

  return { ...rendered, history, router };
}

export async function navigateApp(router: ReturnType<typeof createAppRouter>, href: string) {
  await router.navigate({ to: href as never });
  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

export async function navigateAppWithSearch(
  router: ReturnType<typeof createAppRouter>,
  to: string,
  search: Record<string, unknown>,
) {
  await router.navigate({ to: to as never, search: search as never });
  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

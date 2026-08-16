import { describe, expect, it } from "vitest";
import { LabErrorPage } from "./pages/LabErrorPage";
import { router } from "./router";

describe("lab route resilience", () => {
  it.each(["/labs/image-encoding", "/labs/audio-encoding", "/labs/home-network"])(
    "configures local error boundary for %s",
    (path) => {
      expect(
        router.routesByPath[path as keyof typeof router.routesByPath]?.options.errorComponent,
      ).toBe(LabErrorPage);
    },
  );
});

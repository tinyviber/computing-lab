import { describe, expect, it } from "vitest";
import { LabErrorPage } from "./pages/LabErrorPage";
import { router } from "./router";

describe("lab route resilience", () => {
  it("configures a local error boundary for the calculator lab", () => {
    expect(router.routesByPath["/classes/$classId/labs/calculator"]?.options.errorComponent).toBe(
      LabErrorPage,
    );
  });
});

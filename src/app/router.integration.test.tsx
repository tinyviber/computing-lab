import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { navigateApp, navigateAppWithSearch, renderAppAt } from "../test/router-test-helpers";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("application router integration", () => {
  it.each([
    [
      "image lesson",
      "/labs/image-encoding?scenario=low-sampling&bits=3",
      /图像编码 workspace/i,
      /2 by 2 quantized pixel preview/i,
    ],
    [
      "audio lesson",
      "/labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12",
      /声音编码 workspace/i,
      /high-pulse|16.?000|12.?bit/i,
    ],
    [
      "network lesson",
      "/labs/home-network?scenario=wrong-gateway",
      /家庭网络配置 workspace/i,
      /192\.168\.1\.254/i,
    ],
  ])("hydrates %s from a direct query URL", async (_name, entry, landmark, expected) => {
    await renderAppAt(entry);

    expect(document.querySelector("main")).toHaveAccessibleName(landmark);
    if (_name === "image lesson") {
      expect(screen.getByRole("grid", { name: expected })).toBeInTheDocument();
    } else if (_name === "audio lesson") {
      expect(document.body).toHaveTextContent(expected);
    } else {
      expect(document.body).toHaveTextContent(expected);
    }
  });

  it("hydrates a base-prefixed deep link with the test router history", async () => {
    await renderAppAt("/computing-lab/labs/image-encoding?scenario=low-sampling", "/computing-lab");

    expect(document.querySelector("h1")).toHaveTextContent("图像编码");
    expect(
      screen.getByRole("grid", { name: /2 by 2 quantized pixel preview/i }),
    ).toBeInTheDocument();
  });

  it("changes image lesson state when the same route receives a new search", async () => {
    const { router } = await renderAppAt("/labs/image-encoding");
    expect(
      screen.getByRole("grid", { name: /4 by 4 quantized pixel preview/i }),
    ).toBeInTheDocument();

    await navigateApp(router, "/labs/image-encoding?scenario=high-quantization&density=3&bits=7");

    expect(
      screen.getByRole("grid", { name: /3 by 3 quantized pixel preview/i }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("9 × 7 = 63 bits");
  });

  it("changes Sound lesson state when the same route receives a new canonical search", async () => {
    const { router } = await renderAppAt("/labs/audio-encoding?source=pure440");
    expect(document.body).toHaveTextContent(/pure440/i);

    await navigateApp(
      router,
      "/labs/audio-encoding?source=sawtooth&sampleRate=16000&bitDepth=12&mode=quantization&view=levels",
    );

    expect(document.body).toHaveTextContent(/sawtooth/i);
    expect(document.body).toHaveTextContent(/quantization|levels/i);
  });

  it("changes network lesson state when the same route receives a new search", async () => {
    const { router } = await renderAppAt("/labs/home-network");
    expect(screenText()).toContain("192.168.1.1");

    await navigateApp(router, "/labs/home-network?scenario=wrong-gateway");

    expect(screenText()).toContain("192.168.1.254");
  });

  it("navigates between lessons through real router links without a document reload", async () => {
    const user = userEvent.setup();
    const { router } = await renderAppAt("/labs/image-encoding");

    await user.click(document.querySelector('a.lab-link[href="/labs/audio-encoding"]')!);
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("声音编码");

    await user.click(document.querySelector('a.lab-link[href="/labs/home-network"]')!);
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("家庭网络配置");
  });

  it("restores lesson and query state through back and forward", async () => {
    const { history, router } = await renderAppAt("/labs/image-encoding");
    await navigateApp(router, "/labs/audio-encoding?source=high-pulse&mode=aliasing");
    await navigateApp(router, "/labs/home-network?scenario=wrong-gateway");

    history.back();
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("声音编码");
    expect(document.body).toHaveTextContent(/high-pulse|aliasing/i);

    history.forward();
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("家庭网络配置");
    expect(document.body).toHaveTextContent("192.168.1.254");
  });

  it.each([
    ["image", "/labs/image-encoding"],
    ["audio", "/labs/audio-encoding"],
    ["network", "/labs/home-network"],
  ])(
    "does not replace browser history methods while mounting the %s lesson",
    async (_name, entry) => {
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;

      const { unmount } = await renderAppAt(entry);
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);

      unmount();
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    },
  );

  it("accepts unknown and repeated query keys while using the first scenario and number values", async () => {
    const { router } = await renderAppAt("/labs/image-encoding");

    await navigateAppWithSearch(router, "/labs/image-encoding", {
      scenario: ["low-sampling", "high-quantization"],
      density: [999, 2],
      bits: -1,
      unknownKey: "ignored",
    });

    expect(
      screen.getByRole("grid", { name: /8 by 8 quantized pixel preview/i }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("64 × 2 = 128 bits");
  });

  it.each([
    ["scenario array-shaped key", "scenario[]=low-sampling", "4 by 4 quantized pixel preview"],
    ["scenario number", "scenario=123", "4 by 4 quantized pixel preview"],
  ])("keeps the %s at the balanced boundary", async (_name, query, expected) => {
    await renderAppAt(`/labs/image-encoding?${query}&unknownKey=ignored`);

    expect(screen.getByRole("grid", { name: new RegExp(expected, "i") })).toBeInTheDocument();
  });
});

function screenText(): string {
  return document.body.textContent ?? "";
}

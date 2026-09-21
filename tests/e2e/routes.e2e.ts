import { expect, test, type Page } from "@playwright/test";
import { wireGraph } from "../../src/features/calculator/domain/fixtures.ts";

function collectFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (new URL(url, "http://localhost").pathname.startsWith("/api/")) return;
    failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test("serves the root app, calculator entry, and not-found fallback", async ({ page }) => {
  const failures = collectFailures(page);

  const root = await page.goto(".", { waitUntil: "networkidle" });
  expect(root?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/计算实验室/);

  const calculator = await page.goto("labs/calculator", { waitUntil: "networkidle" });
  expect(calculator?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText("登录");

  const missing = await page.goto("missing-route", { waitUntil: "networkidle" });
  expect(missing?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/实验不存在/);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("completes the first calculator stage through the real API", async ({ page, request }) => {
  const failures = collectFailures(page);

  const adminLogin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: "admin-dev-password" },
  });
  expect(adminLogin.status()).toBe(200);

  const classesResponse = await request.get("/api/admin/classes");
  expect(classesResponse.status()).toBe(200);
  const { classes } = (await classesResponse.json()) as { classes: { id: string }[] };
  const classId = classes[0]?.id;
  expect(classId).toBeTruthy();

  const studentNo = `e2e-${Date.now()}`;
  const studentPassword = "e2e-password";
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "API smoke student",
      password: studentPassword,
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill(studentNo);
  await page.getByLabel("密码").fill(studentPassword);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "登录" }).click();
  expect((await loginResponse).status()).toBe(200);

  await page.goto(`classes/${classId}/labs/calculator`, { waitUntil: "networkidle" });
  await expect(page.getByRole("main", { name: "计算器实验区" })).toBeVisible();

  const browserRequest = page.context().request;
  const projectPath = `/api/classes/${classId}/labs/calculator/project`;
  const initialProject = await browserRequest.get(projectPath);
  expect(initialProject.status()).toBe(200);
  await expect(initialProject.json()).resolves.toMatchObject({
    currentStage: 1,
    passedStages: [],
  });

  const graph = wireGraph();
  const draft = await browserRequest.put(`/api/classes/${classId}/labs/calculator/draft`, {
    data: { stageIndex: 1, graph, components: [] },
  });
  expect(draft.status()).toBe(200);

  const judge = await browserRequest.post(`/api/classes/${classId}/labs/calculator/judge`, {
    data: { stageIndex: 1, graph, components: [] },
  });
  expect(judge.status()).toBe(200);
  await expect(judge.json()).resolves.toMatchObject({
    passed: true,
    currentStage: 2,
    passedStages: [1],
  });

  const savedProject = await browserRequest.get(projectPath);
  expect(savedProject.status()).toBe(200);
  await expect(savedProject.json()).resolves.toMatchObject({
    currentStage: 2,
    passedStages: [1],
  });

  expect(failures, failures.join("\n")).toEqual([]);
});

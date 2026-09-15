import { expect, test } from "@playwright/test";

test("serves the Excel lesson as an editable PPTX", async ({ request }) => {
  const response = await request.get("slides/excel-01.pptx");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  expect((await response.body()).subarray(0, 2).toString()).toBe("PK");
});

test("keeps unknown deck files unavailable", async ({ request }) => {
  const missing = await request.get("slides/unknown.pptx");
  expect(missing.status()).toBe(404);
});

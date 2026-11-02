// Guards the committed embedding-model files the AI-intake stage loads
// at runtime: they must exist under public/vendor (the deploy builds
// from `git archive`, so a missing/corrupt commit would 404 in class)
// and match the pinned sha256 manifest.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODEL_ID, SHA256 } from "./embed-manifest.mjs";

const modelDir = join(process.cwd(), "public", "vendor", "models", MODEL_ID);

describe("vendored embedding model", () => {
  for (const [file, expected] of Object.entries(SHA256)) {
    it(`${file} exists and matches the pinned sha256`, () => {
      const path = join(modelDir, file);
      expect(existsSync(path), `${file} missing`).toBe(true);
      const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(digest).toBe(expected);
    });
  }
});

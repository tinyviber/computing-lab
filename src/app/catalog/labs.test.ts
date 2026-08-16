import { describe, expect, it } from "vitest";
import { getLab, labs } from "./labs";

describe("lab catalog", () => {
  it("keeps ids and routes unique and metadata complete", () => {
    expect(new Set(labs.map((lab) => lab.id)).size).toBe(labs.length);
    expect(new Set(labs.map((lab) => lab.route)).size).toBe(labs.length);
    expect(labs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "image-encoding", route: "/labs/image-encoding" }),
        expect.objectContaining({ id: "audio-encoding", route: "/labs/audio-encoding" }),
        expect.objectContaining({ id: "home-network", route: "/labs/home-network" }),
      ]),
    );
    for (const lab of labs) {
      expect(lab.title).not.toBe("");
      expect(lab.category).not.toBe("");
      expect(lab.description).not.toBe("");
      expect(["available", "preview"]).toContain(lab.status);
    }
  });

  it("resolves known cards and rejects unknown ids", () => {
    expect(getLab("image-encoding")).toMatchObject({ route: "/labs/image-encoding" });
    expect(getLab("missing-lab")).toBeUndefined();
  });
});

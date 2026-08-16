import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExperimentStatus } from "./ExperimentStatus";

describe("ExperimentStatus", () => {
  it.each(["ready", "editing", "success"] as const)("uses status semantics for %s", (phase) => {
    render(<ExperimentStatus detail="Details" phase={phase} title="Title" />);

    expect(screen.getByRole("status")).toHaveTextContent("Title");
    expect(screen.getByRole("status")).toHaveTextContent("Details");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds alert semantics for failure without removing status", () => {
    render(<ExperimentStatus detail="Fix it" phase="failure" title="Failure" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Failure");
    expect(screen.getByRole("alert")).toHaveTextContent("Fix it");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IMAGE_SAMPLING_STAGES } from "../domain/stages.ts";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";

describe("DownsampleExplorer share link", () => {
  it("does not render share button when shareSearch is not provided", () => {
    const stage = IMAGE_SAMPLING_STAGES[0];
    render(
      <DownsampleExplorer
        height={8}
        onCellPick={vi.fn()}
        onResolution={vi.fn()}
        resolutionReady={true}
        selectedCell={null}
        stage={stage}
        width={8}
      />,
    );
    expect(screen.queryByText("复制实验链接")).not.toBeInTheDocument();
  });

  it("renders share button when shareSearch is provided", () => {
    const stage = IMAGE_SAMPLING_STAGES[0];
    render(
      <DownsampleExplorer
        height={16}
        onCellPick={vi.fn()}
        onResolution={vi.fn()}
        resolutionReady={true}
        selectedCell={null}
        shareSearch={{ stage: 1, w: 16, h: 8 }}
        stage={stage}
        width={16}
      />,
    );
    expect(screen.getByRole("button", { name: /复制实验链接/ })).toBeInTheDocument();
  });
});

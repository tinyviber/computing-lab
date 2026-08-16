import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RangeControl } from "./RangeControl";

describe("RangeControl", () => {
  it("associates label, description, value, bounds, and keyboard changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RangeControl
        description="Control description"
        id="density"
        label="Sampling density"
        max={8}
        min={2}
        onChange={onChange}
        unit="×"
        value={4}
      />,
    );

    const input = screen.getByRole("slider", { name: /sampling density/i });
    expect(input).toHaveAttribute("min", "2");
    expect(input).toHaveAttribute("max", "8");
    expect(input).toHaveAccessibleDescription("Control description");
    expect(screen.getByText("4×")).toBeInTheDocument();

    input.focus();
    await user.keyboard("{ArrowRight}");
    // jsdom does not synthesize native range input change from keyboard events.
    fireEvent.change(input, { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

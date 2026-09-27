import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { RuleRow } from "../domain/rules.ts";
import { RuleTableEditor } from "./RuleTableEditor";

const row: RuleRow = {
  when: { kind: "leaf", sensor: "airTemp", op: "<", value: 200 },
  actuator: "heater",
  set: "on",
};

function Harness({ initial = [row] }: { initial?: RuleRow[] }) {
  const [rules, setRules] = useState<RuleRow[]>(initial);
  return (
    <RuleTableEditor
      actuators={["heater", "fan"]}
      maxRules={4}
      onChange={setRules}
      previewRead={null}
      rules={rules}
      sensors={["airTemp"]}
    />
  );
}

function input() {
  return screen.getByRole("spinbutton") as HTMLInputElement;
}

describe("RuleTableEditor threshold input", () => {
  it("keeps in-progress text while typing a decimal threshold", () => {
    render(<Harness />);
    const el = input();
    // jsdom coerces type=number to valid floats, so "27." can't be asserted;
    // the old controlled fmtFixed would already show "2.0"/"27.0" here.
    for (const t of ["2", "27", "27.5"]) {
      fireEvent.change(el, { target: { value: t } });
      expect(el.value).toBe(t); // never reformatted mid-edit
    }
    fireEvent.change(el, { target: { value: "27." } });
    fireEvent.change(el, { target: { value: "27.5" } });
    expect(el.value).toBe("27.5");
    expect(screen.getByText(/空气温度 < 27\.5/)).toBeTruthy();
  });

  it("formats and clamps on blur instead of dropping out-of-range values", () => {
    render(<Harness />);
    const el = input();
    fireEvent.change(el, { target: { value: "60" } }); // airTemp hi is 60.0 — out of open range
    fireEvent.blur(el);
    expect(el.value).toBe("59.9");
    expect(screen.getByText(/空气温度 < 59\.9/)).toBeTruthy();
  });

  it("restores the stored value when blurred on invalid text", () => {
    render(<Harness />);
    const el = input();
    fireEvent.change(el, { target: { value: "-" } });
    fireEvent.blur(el);
    expect(el.value).toBe("20.0");
  });
});

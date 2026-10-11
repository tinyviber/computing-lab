import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { runProgram } from "../domain/machine.ts";
import { TraceRows, TraceTable } from "./TraceTable.tsx";

const LOAD_STORE_HALT = [
  { op: "LOAD", reg: 0, operand: 14 },
  { op: "STORE", reg: 0, operand: 15 },
  { op: "HALT", reg: 0, operand: 0 },
] as const;

describe("TraceRows", () => {
  it("shows the value committed by each cycle, not the run's terminal A (issue #100 review)", () => {
    // M3's first demo case: LOAD A,M[14]=3 then ADD A,M[11]=5 → final A=8.
    // Walking only cycle 1 must show A=3 (what LOAD committed), never 8.
    const run = runProgram(
      [
        { op: "LOAD", reg: 0, operand: 14 },
        { op: "ADD", reg: 0, operand: 11 },
        { op: "STORE", reg: 0, operand: 15 },
        { op: "HALT", reg: 0, operand: 0 },
      ],
      { 11: 5, 14: 3 },
    );
    render(
      <table>
        <tbody>
          <TraceRows finalRegs={run.final.regs} trace={run.trace} visibleCount={1} />
        </tbody>
      </table>,
    );
    const row = screen.getAllByRole("row")[0];
    const cells = within(row).getAllByRole("cell");
    // A column (4th) shows the value cycle 1 committed — 3, not the final 8.
    expect(cells[3]).toHaveTextContent("3");
    expect(cells[3]).not.toHaveTextContent("8");
  });
});

describe("TraceTable", () => {
  it("keeps already-walked rows when scrubbing back to an earlier cycle", () => {
    const run = runProgram([...LOAD_STORE_HALT], { 14: 7 });
    // Walked to the end (visited=3) but viewing cycle 1 — rows 2/3 must stay.
    const { rerender } = render(<TraceTable cursor={1} onScrub={() => {}} run={run} visited={3} />);
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(4); // head + 3 walked + end
    expect(screen.getByText(/结束：/)).toBeInTheDocument();

    // Scrubbing back must NOT collapse the walked rows.
    rerender(<TraceTable cursor={0} onScrub={() => {}} run={run} visited={3} />);
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/结束：/)).toBeInTheDocument();
  });

  it("reveals the end row and total only once the run is fully walked", () => {
    const run = runProgram([...LOAD_STORE_HALT], { 14: 7 });
    render(<TraceTable cursor={0} onScrub={() => {}} run={run} visited={0} />);
    expect(screen.queryByText(/结束：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 个周期/)).not.toBeInTheDocument();
  });
});

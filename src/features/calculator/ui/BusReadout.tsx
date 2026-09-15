/**
 * Live numeric readout for the current stage's buses. Sits above the
 * circuit canvas so toggling an input pin immediately shows the whole
 * number it forms — the core "these bits ARE a number" evidence.
 * Text first; color is only a secondary cue (undriven pins get
 * is-floating and a literal "?").
 */

import { readBuses, type BusReading } from "../domain/bus";
import type { Bit } from "../domain/graph";
import type { StageDef } from "../domain/stages";

function BusCard({ reading }: { reading: BusReading }) {
  const { bus } = reading;
  return (
    <article className="bus-card">
      <header className="bus-card-head">
        <strong>{bus.name}</strong>
        <span className="bus-direction">高位 → 低位</span>
      </header>
      <div className="bus-bits" role="list">
        {bus.pins.map((pin, i) => {
          const bit = reading.bits[i];
          return (
            <span
              aria-label={`${pin}，值 ${bit ?? "?"}`}
              className={`bus-bit${bit === null ? " is-floating" : ""}`}
              key={pin}
              role="listitem"
            >
              <span aria-hidden="true" className="bus-bit-name">
                {pin}
              </span>
              <span aria-hidden="true" className="bus-bit-value">
                {bit ?? "?"}
              </span>
            </span>
          );
        })}
      </div>
      <p className="bus-reading">
        <span className="bus-reading-label">无符号</span>
        <strong>{reading.unsigned ?? "—"}</strong>
      </p>
      {bus.signed ? (
        <p className="bus-reading">
          <span className="bus-reading-label">补码</span>
          <strong>{reading.signed ?? "—"}</strong>
        </p>
      ) : null}
      {reading.placeValue ? <p className="bus-place-value">{reading.placeValue}</p> : null}
    </article>
  );
}

function BusGroup({ title, readings }: { title: string; readings: BusReading[] }) {
  if (readings.length === 0) return null;
  return (
    <div className="bus-group">
      <p className="eyebrow">{title}</p>
      <div className="bus-cards">
        {readings.map((reading) => (
          <BusCard key={reading.bus.name} reading={reading} />
        ))}
      </div>
    </div>
  );
}

export function BusReadout({ stage, pins }: { stage: StageDef; pins: Record<string, Bit | null> }) {
  const readings = readBuses(stage.buses, pins);
  return (
    <section aria-label="数值读数" className="bus-readout">
      <BusGroup readings={readings.filter((r) => r.bus.role === "input")} title="输入" />
      <BusGroup readings={readings.filter((r) => r.bus.role === "output")} title="输出" />
    </section>
  );
}

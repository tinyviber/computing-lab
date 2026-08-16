import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LabShell } from "../../../shared/lab/LabShell";
import { FormulaPanel } from "../../../shared/lab/FormulaPanel";
import { RangeControl } from "../../../shared/lab/RangeControl";
import { StatusMessage } from "../../../shared/lab/StatusMessage";
import { VisualizationPanel } from "../../../shared/lab/VisualizationPanel";
import {
  buildPixelGrid,
  calculateMetrics,
  clamp,
  parseImageEncodingScenario,
  type Phase,
} from "../domain/model";

const STEPS = [
  { id: 1, title: "Observe sampling", detail: "Read the sampled pixel field" },
  { id: 2, title: "Adjust quantization", detail: "Tune density and palette depth" },
  { id: 3, title: "Calculate file size", detail: "Compare the encoded estimate" },
  { id: 4, title: "Write conclusion", detail: "Record what changed" },
] as const;

const STATUS_COPY: Record<Phase, { title: string; detail: string }> = {
  ready: { title: "Ready", detail: "Set a sampling profile, then run a local preview." },
  editing: { title: "Editing", detail: "Review the sampled frame and submit when ready." },
  success: { title: "Success", detail: "The target profile produced the expected local result." },
  failure: { title: "Failure", detail: "Use density 4 and 8 bits for the target lesson profile." },
};

const LOCATION_CHANGE_EVENT = "computing-lab-locationchange";
let historyEventsInstalled = false;

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function installHistoryEvents() {
  if (typeof window === "undefined" || historyEventsInstalled) return;
  historyEventsInstalled = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
      return result;
    };
  }
}

function subscribeToLocation(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  installHistoryEvents();
  window.addEventListener("popstate", listener);
  window.addEventListener(LOCATION_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(LOCATION_CHANGE_EVENT, listener);
  };
}

function useLocationSearch(): string {
  return useSyncExternalStore(subscribeToLocation, currentSearch, () => "");
}

function WorkflowRail({ step }: { step: number }) {
  return (
    <div className="lesson-steps">
      <div className="rail-heading">
        <div>
          <p className="eyebrow">WORKFLOW</p>
          <h2>Compression pass</h2>
        </div>
        <span className="rail-count">0{step}/04</span>
      </div>
      <nav aria-label="Workflow steps">
        <ol className="step-list">
          {STEPS.map((item) => {
            const state = item.id < step ? "complete" : item.id === step ? "current" : "upcoming";
            return (
              <li className={`step-item step-${state}`} key={item.id}>
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className="step-marker"
                >
                  {state === "complete" ? "✓" : item.id}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

export function ImageEncodingPage() {
  const search = useLocationSearch();
  const scenario = useMemo(() => parseImageEncodingScenario(search), [search]);
  const [density, setDensity] = useState(scenario.density);
  const [bits, setBits] = useState(scenario.bits);
  const [phase, setPhase] = useState<Phase>("ready");
  const [step, setStep] = useState(1);
  const metrics = useMemo(() => calculateMetrics(density, bits), [density, bits]);
  const pixels = useMemo(() => buildPixelGrid({ density, bits }), [density, bits]);
  const status = STATUS_COPY[phase];

  useEffect(() => {
    setDensity(scenario.density);
    setBits(scenario.bits);
    setPhase("ready");
    setStep(1);
  }, [scenario.bits, scenario.density, scenario.scenario]);

  const updateDensity = (value: number) => {
    setDensity(clamp(value, 2, 8));
    setPhase("editing");
  };
  const updateBits = (value: number) => {
    setBits(clamp(value, 2, 8));
    setPhase("editing");
  };
  const runPreview = () => {
    if (phase === "ready") setPhase("editing");
  };
  const submit = () => {
    if (phase === "editing") setPhase(density === 4 && bits === 8 ? "success" : "failure");
  };
  const nextStep = () => {
    if (phase === "success" && step < 4) {
      setStep((current) => current + 1);
      setPhase("ready");
    }
  };
  const reset = () => {
    setDensity(scenario.density);
    setBits(scenario.bits);
    setPhase("ready");
  };

  return (
    <LabShell
      controlsLabel="Compression inspector"
      eyebrow="IMAGE / 01"
      title="图像编码"
      subtitle="Sampling and quantization"
      navigation={<WorkflowRail step={step} />}
      visualization={
        <section className="lesson-section" aria-labelledby="preview-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE PREVIEW</p>
              <h2 id="preview-heading">Sampled pixel field</h2>
              <p className="section-description">
                Density changes represented pixels; bits changes indexed palette depth.
              </p>
            </div>
            <span className="workflow-progress">Step {step} / 4</span>
            <span className={`phase-badge phase-${phase}`}>
              <span className="phase-dot" aria-hidden="true" />
              {phase === "success" ? "Accepted" : phase === "failure" ? "Needs adjustment" : phase}
            </span>
          </div>
          <VisualizationPanel
            eyebrow="OUTPUT FRAME"
            meta={`${density}×${density} / ${bits}-bit indexed`}
            footer={
              <>
                <div className="legend-item">
                  <span className="legend-swatch legend-source" aria-hidden="true" />
                  Source sample
                </div>
                <div className="legend-item">
                  <span className="legend-swatch legend-display" aria-hidden="true" />
                  Quantized display
                </div>
                <span className="sample-count">{metrics.sampledPixels} samples</span>
              </>
            }
          >
            <div className="pixel-stage">
              <div
                aria-label={`${density} by ${density} quantized pixel preview at ${bits} bits`}
                className="pixel-grid"
                role="grid"
                style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
              >
                {pixels.map((pixel) => (
                  <div
                    aria-label={`Row ${pixel.row + 1}, column ${pixel.col + 1}, sample ${pixel.sampleIndex}, source ${pixel.sourceColor}, palette index ${pixel.paletteIndex}, display ${pixel.displayColor}, bits ${bits}`}
                    className="pixel-cell"
                    key={`${pixel.row}-${pixel.col}`}
                    role="gridcell"
                    style={{ backgroundColor: pixel.displayColor }}
                  />
                ))}
              </div>
            </div>
          </VisualizationPanel>
          <div className="summary-panel">
            <div className="summary-heading">
              <p className="eyebrow">SUMMARY</p>
              <span className="summary-note">Calculated locally</span>
            </div>
            <dl className="metrics-grid metrics-grid-six">
              <div className="metric-item">
                <dt>Sampled pixels</dt>
                <dd>
                  {metrics.sampledPixels}
                  <span> px</span>
                </dd>
              </div>
              <div className="metric-item">
                <dt>Quantization bits</dt>
                <dd>
                  {metrics.quantizationBits}
                  <span> bit</span>
                </dd>
              </div>
              <div className="metric-item">
                <dt>Encoded payload</dt>
                <dd>
                  {metrics.encodedBits}
                  <span> bits</span>
                </dd>
              </div>
              <div className="metric-item">
                <dt>Encoded bytes</dt>
                <dd>
                  {metrics.encodedBytes}
                  <span> bytes</span>
                </dd>
              </div>
              <div className="metric-item">
                <dt>Raw baseline</dt>
                <dd>
                  {metrics.rawSourceBits}
                  <span> bits</span>
                </dd>
              </div>
              <div className="metric-item">
                <dt>Compression ratio</dt>
                <dd>
                  {metrics.compressionRatio}
                  <span>×</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      }
      controls={
        <div className="inspector-panel">
          <div className="inspector-heading">
            <p className="eyebrow">INSPECTOR</p>
            <strong>Compression settings</strong>
          </div>
          <div className="inspector-body">
            <div className="inspector-intro">
              <p>Adjust profile to see indexed palette data against its raw source.</p>
              <span className="profile-code">PX / LOCAL</span>
            </div>
            <RangeControl
              description="How many source samples to retain."
              id="density"
              label="Sampling density"
              max={8}
              min={2}
              onChange={updateDensity}
              unit="×"
              value={density}
            />
            <RangeControl
              description="Bits stored for each indexed pixel."
              id="bits"
              label="Quantization bits"
              max={8}
              min={2}
              onChange={updateBits}
              unit=" bit"
              value={bits}
            />
          </div>
        </div>
      }
      explanation={
        <FormulaPanel
          title="ENCODING FORMULA"
          rows={[
            {
              label: "Raw baseline",
              value: "8×8 uncompressed 24-bit RGB source",
            },
            {
              label: "Indexed payload",
              value: `${metrics.sampledPixels} × ${bits} = ${metrics.encodedBits} bits`,
            },
            {
              label: "Encoded bytes",
              value: `ceil(${metrics.encodedBits} / 8) = ${metrics.encodedBytes} bytes`,
            },
          ]}
        />
      }
      actions={
        <div className="inspector-actions">
          <StatusMessage phase={phase} title={status.title} detail={status.detail} />
          <div className="action-grid">
            <button className="button button-primary" onClick={runPreview} type="button">
              Run preview <span aria-hidden="true">→</span>
            </button>
            <button className="button button-primary" onClick={submit} type="button">
              Submit <span aria-hidden="true">→</span>
            </button>
            <button
              className="button button-secondary"
              onClick={() => phase === "failure" && setPhase("editing")}
              type="button"
            >
              Retry
            </button>
            <button
              className="button button-secondary"
              disabled={step === 4}
              onClick={nextStep}
              type="button"
            >
              Next step <span aria-hidden="true">→</span>
            </button>
            <button className="button button-secondary button-reset" onClick={reset} type="button">
              Reset
            </button>
          </div>
          <p className="action-hint">Controls stay live while moving between workflow steps.</p>
        </div>
      }
    />
  );
}

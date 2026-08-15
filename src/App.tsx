import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildPixelGrid,
  calculateMetrics,
  clamp,
  type Phase,
} from "./features/image-encoding/domain/model";

const STEPS = [
  { id: 1, title: "Observe sampling", detail: "Read the sampled pixel field" },
  { id: 2, title: "Adjust quantization", detail: "Tune density and palette depth" },
  { id: 3, title: "Calculate file size", detail: "Compare the encoded estimate" },
  { id: 4, title: "Write conclusion", detail: "Record what changed" },
] as const;

const STATUS_COPY: Record<Phase, { title: string; detail: string }> = {
  ready: {
    title: "Ready",
    detail: "Set a sampling profile, then run a local preview.",
  },
  editing: {
    title: "Editing",
    detail: "Review the quantized frame and submit when it looks right.",
  },
  success: {
    title: "Success",
    detail: "The target profile produced the expected local result.",
  },
  failure: {
    title: "Failure",
    detail: "Use density 4 and 8 bits for the target compression profile.",
  },
};

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="icon icon-chevron">
      <path d="m3.5 6 4.5 4 4.5-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="icon">
      <path d="M3 5h12M3 9h12M3 13h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="icon">
      <path d="m5 5 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="icon icon-arrow">
      <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="icon">
      <path d="M3.5 5.5A5 5 0 1 1 3 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M3.5 2.75v2.75h2.75" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

type RangeControlProps = {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
};

function RangeControl({
  id,
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: RangeControlProps) {
  return (
    <div className="control-group">
      <div className="control-heading">
        <div>
          <label className="control-label" htmlFor={id}>{label}</label>
          <p className="control-description">{description}</p>
        </div>
        <span className="control-value">{value}{unit}</span>
      </div>
      <div className="range-control-shell">
        <input
          aria-label={label}
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={value}
          className="range-input"
          id={id}
          max={max}
          min={min}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          step={1}
          style={{ "--range-progress": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
          type="range"
          value={value}
        />
      </div>
      <div className="range-scale" aria-hidden="true">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function App() {
  const [density, setDensity] = useState(4);
  const [bits, setBits] = useState(8);
  const [phase, setPhase] = useState<Phase>("ready");
  const [step, setStep] = useState(1);
  const [railOpen, setRailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const metrics = useMemo(() => calculateMetrics(density, bits), [density, bits]);
  const pixels = useMemo(() => buildPixelGrid({ density, bits }), [density, bits]);
  const status = STATUS_COPY[phase];
  const mobileRailClosed = isMobile && !railOpen;

  const closeRail = () => {
    setRailOpen(false);
    menuButtonRef.current?.focus();
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleMediaChange = () => setIsMobile(mediaQuery.matches);
    handleMediaChange();
    mediaQuery.addEventListener?.("change", handleMediaChange);

    return () => mediaQuery.removeEventListener?.("change", handleMediaChange);
  }, []);

  useEffect(() => {
    if (!railOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRail();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [railOpen]);

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

  const submitCompression = () => {
    if (phase !== "editing") return;
    setPhase(density === 4 && bits === 8 ? "success" : "failure");
  };

  const retryCompression = () => {
    if (phase === "failure") setPhase("editing");
  };

  const nextStep = () => {
    if (phase === "success" && step < 4) {
      setStep(step + 1);
      setPhase("ready");
    }
  };

  const reset = () => {
    setDensity(4);
    setBits(8);
    setPhase("ready");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button
            aria-controls="workflow-rail"
            aria-expanded={railOpen}
            aria-label={railOpen ? "Close workflow menu" : "Open workflow menu"}
            className="mobile-menu-button"
            onClick={() => setRailOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            {railOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <div className="brand-mark" aria-hidden="true">CL</div>
          <div>
            <h1>图像编码</h1>
            <p>Computing Lab · local color reduction workspace</p>
          </div>
        </div>
        <div className="topbar-context">
          <span className="context-label">WORKFLOW</span>
          <span className="context-value">Step {step} / 4</span>
        </div>
      </header>

      {isMobile && railOpen && <button aria-label="Close workflow menu" className="rail-scrim" onClick={closeRail} type="button" />}

      <div className="app-layout">
        <aside
          aria-hidden={mobileRailClosed}
          aria-label="Compression workflow"
          className={`workflow-rail${railOpen ? " is-open" : ""}`}
          id="workflow-rail"
          inert={mobileRailClosed ? true : undefined}
        >
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
                    <span aria-current={state === "current" ? "step" : undefined} className="step-marker">
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

          <div className="rail-footer">
            <span className="local-dot" aria-hidden="true" />
            <div>
              <strong>Local workspace</strong>
              <span>Everything stays local</span>
            </div>
          </div>
        </aside>

        <main className="workspace" aria-label="Pixel compression workspace">
          <section className="preview-section" aria-labelledby="preview-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LIVE PREVIEW</p>
                <h2 id="preview-heading">Quantized pixel field</h2>
                <p className="section-description">A fixed four-by-four frame makes the sampling trade-off easy to inspect.</p>
              </div>
              <span className={`phase-badge phase-${phase}`}>
                <span className="phase-dot" aria-hidden="true" />
                {phase === "ready" ? "Ready" : phase === "editing" ? "Editing" : phase === "success" ? "Accepted" : "Needs adjustment"}
              </span>
            </div>

            <div className="preview-panel">
              <div className="preview-panel-header">
                <span>OUTPUT FRAME</span>
                <code>fixed frame / {bits}-bit</code>
              </div>
              <div className="pixel-stage">
                <div className="stage-crosshair stage-crosshair-top" aria-hidden="true" />
                <div className="stage-crosshair stage-crosshair-bottom" aria-hidden="true" />
                <div aria-label={`4 by 4 quantized pixel preview at ${bits} bits`} className="pixel-grid" role="grid">
                  {pixels.map((pixel) => (
                    <div
                      aria-label={`Row ${pixel.row + 1}, column ${pixel.col + 1}, sample ${pixel.sampleIndex}, source ${pixel.sourceColor}, display ${pixel.displayColor}, bits ${bits}`}
                      className="pixel-cell"
                      key={`${pixel.row}-${pixel.col}`}
                      role="gridcell"
                      style={{ backgroundColor: pixel.displayColor }}
                    />
                  ))}
                </div>
              </div>
              <div className="preview-panel-footer">
                <div className="legend-item"><span className="legend-swatch legend-source" aria-hidden="true" />Source color</div>
                <div className="legend-item"><span className="legend-swatch legend-display" aria-hidden="true" />Snapped display color</div>
                <span className="sample-count">Local output</span>
              </div>
            </div>

            <div className="summary-panel">
              <div className="summary-heading">
                <p className="eyebrow">SUMMARY</p>
                <span className="summary-note">Calculated locally</span>
              </div>
              <dl className="metrics-grid">
                <div className="metric-item">
                  <dt>Sampled pixels</dt>
                  <dd>{metrics.sampled}<span> px</span></dd>
                </div>
                <div className="metric-item">
                  <dt>Quantization</dt>
                  <dd>{metrics.paletteLevels}<span> steps</span></dd>
                </div>
                <div className="metric-item">
                  <dt>File estimate</dt>
                  <dd>{metrics.file}<span> KB</span></dd>
                </div>
                <div className="metric-item">
                  <dt>Compression ratio</dt>
                  <dd>{metrics.ratio}<span>×</span></dd>
                </div>
              </dl>
            </div>
          </section>

          <aside className="inspector-column" aria-label="Compression inspector">
            <details className="inspector-panel" open>
              <summary>
                <span>
                  <span className="eyebrow">INSPECTOR</span>
                  <strong>Compression settings</strong>
                </span>
                <ChevronDownIcon />
              </summary>
              <div className="inspector-body">
                <div className="inspector-intro">
                  <p>Adjust the profile to see how much detail survives the pass.</p>
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
                  description="Palette depth used to snap each channel."
                  id="bits"
                  label="Palette bits"
                  max={8}
                  min={2}
                  onChange={updateBits}
                  unit=" bit"
                  value={bits}
                />

                <div className="calculation-card">
                  <div className="calculation-row"><span>Samples</span><code>{density} × {density}</code></div>
                  <div className="calculation-row"><span>Palette</span><code>2^{bits} levels</code></div>
                  <div className="calculation-row"><span>Quality</span><code>{metrics.quality}%</code></div>
                  <div className="calculation-row"><span>Color error</span><code>{metrics.error}%</code></div>
                  <div className="calculation-row"><span>2-bit reference</span><code>6 KB · 67% · 33% · <span>341.3×</span></code></div>
                </div>
              </div>
            </details>

            <div className="inspector-actions">
              <div className={`status-message status-${phase}`} role="status">
                <span className="status-icon" aria-hidden="true">{phase === "failure" ? "!" : phase === "success" ? "✓" : "i"}</span>
                <div role={phase === "failure" ? "alert" : undefined}>
                  <strong>{status.title}</strong>
                  <p>{status.detail}</p>
                </div>
              </div>
              <div className="action-grid">
                <button className="button button-primary" onClick={runPreview} type="button">
                  Run preview
                  <ArrowRightIcon />
                </button>
                <button className="button button-primary" onClick={submitCompression} type="button">
                  Submit
                  <ArrowRightIcon />
                </button>
                <button className="button button-secondary" onClick={retryCompression} type="button">
                  Retry
                </button>
                <button className="button button-secondary" disabled={step === 4} onClick={nextStep} type="button">
                  Next step
                  <ArrowRightIcon />
                </button>
                <button className="button button-secondary button-reset" onClick={reset} type="button">
                  <ResetIcon />
                  Reset
                </button>
              </div>
              <p className="action-hint">Controls stay live while you move between workflow steps.</p>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

export default App;

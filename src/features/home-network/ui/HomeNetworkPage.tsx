import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { ExperimentStatus } from "../../../shared/lab/ExperimentStatus";
import { FormulaPanel } from "../../../shared/lab/FormulaPanel";
import { LabShell } from "../../../shared/lab/LabShell";
import { VisualizationPanel } from "../../../shared/lab/VisualizationPanel";
import { NETWORK_DEVICES, NETWORK_FIXTURE, NETWORK_LINKS, validateNetwork } from "../domain/model";
import { parseHomeNetworkScenario } from "../lesson/scenario";
import { createHomeNetworkLessonState, transitionHomeNetworkLesson } from "../lesson/state";
import "./home-network.css";

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  router: { x: 240, y: 100 },
  laptop: { x: 120, y: 230 },
  phone: { x: 360, y: 230 },
};

function HomeNetworkContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseHomeNetworkScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionHomeNetworkLesson,
    scenario,
    createHomeNetworkLessonState,
  );
  const { gateway, phase } = lesson;
  const validation = useMemo(() => validateNetwork({ ...NETWORK_FIXTURE, gateway }), [gateway]);

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario.gateway, scenario.scenario]);

  const submit = () => dispatch({ type: "submit", valid: validation.valid });
  const statusDetail = validation.valid
    ? "All devices share the router gateway."
    : `Issue codes: ${validation.issues.join(", ")}`;

  return (
    <LabShell
      controlsLabel="Network configuration inspector"
      eyebrow="NETWORK / 01"
      title="家庭网络配置"
      subtitle="Devices and routing"
      visualization={
        <section className="lesson-section" aria-labelledby="network-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TOPOLOGY</p>
              <h2 id="network-heading">把设备接入正确网关</h2>
              <p className="section-description">
                路由器是局域网设备访问其他网络的出口。检查配置，再提交。
              </p>
            </div>
            <span className={`phase-badge phase-${phase}`}>{phase}</span>
          </div>
          <VisualizationPanel
            className="topology-panel"
            eyebrow="HOME NETWORK"
            meta={NETWORK_FIXTURE.cidr}
            footer={<span className="sample-count">{NETWORK_LINKS.length} topology links</span>}
          >
            <section aria-label="Network topology" className="topology-stage">
              <svg
                aria-labelledby="network-graph-title network-graph-description"
                className="topology-graph"
                role="img"
                viewBox="0 0 480 300"
              >
                <title id="network-graph-title">Home network topology</title>
                <desc id="network-graph-description">
                  Router connects to each device through the displayed topology links.
                </desc>
                {NETWORK_LINKS.map((link) => {
                  const from = NETWORK_DEVICES.find((device) => device.id === link.from);
                  const to = NETWORK_DEVICES.find((device) => device.id === link.to);
                  if (!from || !to) return null;
                  const start = NODE_POSITIONS[from.id];
                  const end = NODE_POSITIONS[to.id];
                  return (
                    <g
                      aria-label={`Network link: ${from.name} to ${to.name}`}
                      key={`${link.from}-${link.to}`}
                      role="img"
                    >
                      <title>{`Network link: ${from.name} to ${to.name}`}</title>
                      <line
                        className="topology-link"
                        x1={start.x}
                        x2={end.x}
                        y1={start.y}
                        y2={end.y}
                      />
                    </g>
                  );
                })}
                {NETWORK_DEVICES.map((device) => {
                  const position = NODE_POSITIONS[device.id];
                  return (
                    <g
                      aria-label={`${device.name}, ${device.ip}`}
                      className={`topology-node topology-node-${device.kind}`}
                      key={device.id}
                      role="img"
                    >
                      <title>{`${device.name}, ${device.ip}`}</title>
                      <circle cx={position.x} cy={position.y} r="38" />
                      <text
                        className="topology-node-label"
                        textAnchor="middle"
                        x={position.x}
                        y={position.y - 3}
                      >
                        {device.name}
                      </text>
                      <text
                        className="topology-node-ip"
                        textAnchor="middle"
                        x={position.x}
                        y={position.y + 15}
                      >
                        {device.ip}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <section aria-label="Device palette" className="device-palette">
                <p className="eyebrow">DEVICE PALETTE</p>
                <ul>
                  {NETWORK_DEVICES.map((device) => (
                    <li key={device.id}>
                      <span
                        className={`device-palette-icon device-${device.kind}`}
                        aria-hidden="true"
                      />
                      <span>
                        <button
                          aria-label={`${device.name}, ${device.ip}`}
                          className="device-palette-button"
                          onClick={() => {
                            dispatch({
                              type: "set-gateway",
                              gateway: device.kind === "router" ? device.ip : gateway,
                            });
                          }}
                          type="button"
                        >
                          {device.name}
                        </button>
                        <small>
                          {device.kind} · {device.ip}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </section>
          </VisualizationPanel>
        </section>
      }
      controls={
        <div className="inspector-panel audio-controls">
          <div className="inspector-heading">
            <p className="eyebrow">INSPECTOR</p>
            <strong>Gateway configuration</strong>
          </div>
          <label className="select-label" htmlFor="gateway">
            Default gateway
          </label>
          <input
            aria-label="Default gateway"
            aria-describedby="gateway-description"
            className="network-input"
            id="gateway"
            onChange={(event) => {
              dispatch({ type: "set-gateway", gateway: event.target.value });
            }}
            role="combobox"
            type="text"
            value={gateway}
          />
          <p className="control-description network-input-description" id="gateway-description">
            Enter an IPv4 gateway. Query values are shareable and first value wins.
          </p>
          <div className="calculation-card">
            <div className="calculation-row">
              <span>Network</span>
              <code>{NETWORK_FIXTURE.cidr}</code>
            </div>
            <div className="calculation-row">
              <span>Devices</span>
              <code>{NETWORK_DEVICES.length}</code>
            </div>
            <div className="calculation-row">
              <span>Scenario</span>
              <code>{scenario.scenario}</code>
            </div>
          </div>
        </div>
      }
      explanation={
        <FormulaPanel
          title="NETWORK VALIDATION"
          rows={[
            { label: "Gateway", value: gateway },
            { label: "Status", value: validation.valid ? "valid" : "invalid" },
            { label: "Issue codes", value: validation.issues.join(", ") || "none" },
          ]}
        />
      }
      actions={
        <div className="inspector-actions">
          <button className="button button-primary" onClick={submit} type="button">
            Check configuration <span aria-hidden="true">→</span>
          </button>
          <ExperimentStatus
            phase={phase}
            title={
              phase === "success" ? "Connected" : phase === "failure" ? "Wrong gateway" : "Ready"
            }
            detail={
              phase === "ready"
                ? "Select a gateway, then check the configuration."
                : phase === "failure"
                  ? `Wrong gateway. ${statusDetail}`
                  : statusDetail
            }
          />
          <button
            className="button button-secondary"
            onClick={() => dispatch({ type: "reset" })}
            type="button"
          >
            Reset
          </button>
        </div>
      }
    />
  );
}

export function HomeNetworkPage() {
  const search = useSearch({ from: "/labs/home-network" });
  return <HomeNetworkContent search={search} />;
}

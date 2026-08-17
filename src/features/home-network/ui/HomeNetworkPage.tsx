import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  INTERNET_ENDPOINT,
  NETWORK_LINKS,
  ROUTER_LAN_IP,
  ROUTER_WAN_IP,
  type NetworkDeviceId,
  type NetworkDevice,
  type ProbeEvent,
  type ProbeTarget,
} from "../domain/model";
import { parseHomeNetworkScenario } from "../lesson/scenario";
import { createHomeNetworkLessonState, transitionHomeNetworkLesson } from "../lesson/state";
import "./home-network.css";

const NODE_POSITIONS: Record<NetworkDeviceId, { x: number; y: number }> = {
  router: { x: 255, y: 122 },
  laptop: { x: 112, y: 252 },
  printer: { x: 398, y: 252 },
  internet: { x: 255, y: 34 },
};

function outcomeLabel(event: ProbeEvent): string {
  if (event.outcome === "fail") return "stopped";
  if (event.outcome === "reply") return "reply";
  if (event.outcome === "complete") return "complete";
  return "pass";
}

function packetLabel(packet: ProbeEvent["packet"]): string {
  return `${packet.sourceIp} → ${packet.destinationIp} · next hop ${packet.nextHopIp || "not selected"}`;
}

function deviceAddress(device: NetworkDevice | typeof INTERNET_ENDPOINT): string {
  return device.id === "router" ? device.lanIp : device.ip;
}

function HomeNetworkContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseHomeNetworkScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionHomeNetworkLesson,
    scenario,
    createHomeNetworkLessonState,
  );

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario.scenario, scenario.target]);

  const selectedDevice =
    lesson.selectedDevice === "internet" ? INTERNET_ENDPOINT : lesson.config[lesson.selectedDevice];
  const networkDevices = [lesson.config.router, lesson.config.laptop, lesson.config.printer];
  const selectedTrace = lesson.selectedTrace;
  const selectedFailure = selectedTrace?.firstFailure;
  const latestProbe = lesson.probeHistory[lesson.probeHistory.length - 1];
  const comparisonTrace =
    selectedTrace && latestProbe && selectedTrace.id !== latestProbe.id ? selectedTrace : undefined;
  const selectedTraceTargetLabel = selectedTrace?.target === "printer" ? "打印机" : "Internet";
  const selectedPrediction = selectedTrace ? lesson.probePredictions[selectedTrace.id] : undefined;
  const selectedPredictionLabel =
    selectedPrediction === "local" ? "local / direct" : "remote / router";
  const destinationClassification = selectedTrace?.events.find(
    (event) => event.kind === "destination-classification",
  );
  const observedPath =
    destinationClassification?.reasonCode === "destination-local"
      ? "local"
      : destinationClassification?.reasonCode === "destination-remote"
        ? "remote"
        : undefined;
  const observedPathLabel = observedPath
    ? observedPath === "local"
      ? "local / direct"
      : "remote / router"
    : "not classified";
  const validationReason = selectedTrace?.firstFailure?.reason;

  const editField = (field: "ip" | "prefix" | "gateway", value: string) => {
    if (lesson.selectedDevice === "laptop" || lesson.selectedDevice === "printer") {
      dispatch({ type: "edit-config", device: lesson.selectedDevice, field, value });
    }
  };

  return (
    <LabShell
      eyebrow="NETWORK / 01"
      title="家庭网络探针"
      subtitle="Addressing, ARP, routing and NAT"
    >
      <div className="home-network-page">
        <header className="network-lesson-intro">
          <div>
            <p className="eyebrow">HOME NETWORK / PROBE LAB</p>
            <h2>追踪一个数据包的第一处阻塞</h2>
            <p>
              固定的家庭局域网使用
              192.168.1.0/24。编辑设备配置，选择探针目标，然后观察每一跳的因果证据。
            </p>
          </div>
          <div className="scenario-chip" aria-label={`Preset scenario ${lesson.scenario}`}>
            <span>PRESET</span>
            <strong>{lesson.scenario}</strong>
          </div>
        </header>

        <div className="network-workspace">
          <section className="network-canvas-card" aria-labelledby="topology-heading">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">FIXED TOPOLOGY</p>
                <h3 id="topology-heading">家庭网络路径</h3>
              </div>
              <span className="network-metric">LAN 192.168.1.0/24</span>
            </div>
            <svg
              aria-labelledby="home-network-graph-title home-network-graph-description"
              className="network-topology-svg"
              role="img"
              viewBox="0 0 510 300"
            >
              <title id="home-network-graph-title">Fixed home network topology</title>
              <desc id="home-network-graph-description">
                A router is connected by fixed links to a laptop, printer, and Internet endpoint.
                Links cannot be edited.
              </desc>
              {NETWORK_LINKS.map((link) => {
                const from = NODE_POSITIONS[link.from];
                const to = NODE_POSITIONS[link.to];
                return (
                  <line
                    className="network-topology-link"
                    key={`${link.from}-${link.to}`}
                    x1={from.x}
                    x2={to.x}
                    y1={from.y}
                    y2={to.y}
                  />
                );
              })}
              {[...networkDevices, INTERNET_ENDPOINT].map((device) => {
                const position = NODE_POSITIONS[device.id];
                const selected = lesson.selectedDevice === device.id;
                return (
                  <g
                    aria-label={`${device.name}, ${deviceAddress(device)}`}
                    className={`network-topology-node network-node-${device.kind}${selected ? " is-selected" : ""}`}
                    key={device.id}
                    role="img"
                  >
                    <title>{`${device.name}, ${deviceAddress(device)}`}</title>
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r={device.id === "internet" ? 29 : 39}
                    />
                    <text
                      className="network-node-label"
                      textAnchor="middle"
                      x={position.x}
                      y={position.y - 3}
                    >
                      {device.name}
                    </text>
                    <text
                      className="network-node-ip"
                      textAnchor="middle"
                      x={position.x}
                      y={position.y + 15}
                    >
                      {deviceAddress(device)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="topology-notes">
              <span>
                <b>LAN</b> {ROUTER_LAN_IP}/24
              </span>
              <span>
                <b>WAN</b> {ROUTER_WAN_IP}/24
              </span>
              <span>Fixed links · no topology editor</span>
            </div>
            <div className="network-device-list" aria-label="Fixed network devices">
              {networkDevices.map((device) => (
                <button
                  aria-pressed={lesson.selectedDevice === device.id}
                  className={`device-summary device-summary-${device.kind}`}
                  key={device.id}
                  onClick={() => dispatch({ type: "select-device", device: device.id })}
                  type="button"
                >
                  <span className="device-summary-dot" aria-hidden="true" />
                  <span>
                    <strong>{device.name}</strong>
                    <small>{deviceAddress(device)}</small>
                  </span>
                </button>
              ))}
              <button
                aria-pressed={lesson.selectedDevice === "internet"}
                className="device-summary device-summary-internet"
                onClick={() => dispatch({ type: "select-device", device: "internet" })}
                type="button"
              >
                <span className="device-summary-dot" aria-hidden="true" />
                <span>
                  <strong>Internet</strong>
                  <small>{INTERNET_ENDPOINT.ip}/24</small>
                </span>
              </button>
            </div>
          </section>

          <aside aria-label="Network device inspector" className="network-inspector-card">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">INSPECTOR</p>
                <h3>设备配置</h3>
              </div>
              <span className="inspector-lock">FIXED SOURCE: LAPTOP</span>
            </div>
            <label className="network-field-label" htmlFor="device-inspector">
              Inspect device
            </label>
            <select
              className="network-select"
              id="device-inspector"
              onChange={(event) =>
                dispatch({ type: "select-device", device: event.target.value as NetworkDeviceId })
              }
              value={lesson.selectedDevice}
            >
              <option value="laptop">学习电脑</option>
              <option value="printer">打印机</option>
              <option value="router">家庭路由器</option>
              <option value="internet">Internet</option>
            </select>
            <p className="network-field-help">设备检查选择独立于探针目标。</p>

            <div className="network-inspector-details">
              {selectedDevice ? (
                <>
                  <div className="device-detail-heading">
                    <span className="detail-device-kind">{selectedDevice.kind}</span>
                    <strong>{selectedDevice.name}</strong>
                  </div>
                  {selectedDevice.id === "router" ? (
                    <div className="fixed-route-list">
                      <strong>Interfaces</strong>
                      <span>
                        LAN · {selectedDevice.lanIp}/{selectedDevice.lanPrefix}
                      </span>
                      <span>
                        WAN · {selectedDevice.wanIp}/{selectedDevice.wanPrefix}
                      </span>
                      <strong>Connected routes</strong>
                      {selectedDevice.connectedRoutes.map((route) => (
                        <span key={route}>{route}</span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label className="network-field-label" htmlFor="device-ip">
                        IPv4 address
                      </label>
                      <input
                        aria-describedby="device-ip-help"
                        className="network-input"
                        id="device-ip"
                        onChange={(event) => editField("ip", event.target.value)}
                        readOnly={selectedDevice.id !== "laptop" && selectedDevice.id !== "printer"}
                        type="text"
                        value={selectedDevice.ip}
                      />
                      <p className="network-field-help" id="device-ip-help">
                        Use four decimal octets.
                      </p>
                      <label className="network-field-label" htmlFor="device-prefix">
                        Prefix length
                      </label>
                      <div className="network-prefix-input">
                        <span aria-hidden="true">/</span>
                        <input
                          aria-describedby="device-prefix-help"
                          className="network-input network-prefix"
                          id="device-prefix"
                          onChange={(event) => editField("prefix", event.target.value)}
                          readOnly={
                            selectedDevice.id !== "laptop" && selectedDevice.id !== "printer"
                          }
                          type="text"
                          value={selectedDevice.prefix}
                        />
                      </div>
                      <p className="network-field-help" id="device-prefix-help">
                        Only integer prefixes /1 through /30 are valid.
                      </p>
                      {selectedDevice.id !== "internet" ? (
                        <>
                          <label className="network-field-label" htmlFor="device-gateway">
                            Default gateway
                          </label>
                          <input
                            aria-describedby="device-gateway-help"
                            className="network-input"
                            id="device-gateway"
                            onChange={(event) => editField("gateway", event.target.value)}
                            type="text"
                            value={selectedDevice.gateway}
                          />
                          <p className="network-field-help" id="device-gateway-help">
                            Gateway resolution is checked during ARP, not preflight.
                          </p>
                        </>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <p>Internet is a fixed probe endpoint at 203.0.113.10/24.</p>
              )}
            </div>
          </aside>
        </div>

        <section aria-labelledby="probe-heading" className="probe-control-card">
          <div className="network-card-heading">
            <div>
              <p className="eyebrow">SEND A PROBE</p>
              <h3 id="probe-heading">选择目标并预测路径</h3>
            </div>
            <span className="source-chip">Source · laptop · {lesson.config.laptop.ip}</span>
          </div>
          <div className="probe-control-grid">
            <div>
              <label className="network-field-label" htmlFor="probe-target">
                Probe target
              </label>
              <select
                className="network-select network-select-wide"
                id="probe-target"
                onChange={(event) =>
                  dispatch({ type: "set-target", target: event.target.value as ProbeTarget })
                }
                value={lesson.target}
              >
                <option value="printer">打印机 · {lesson.config.printer.ip}</option>
                <option value="internet">Internet · {INTERNET_ENDPOINT.ip}</option>
              </select>
            </div>
            <div>
              <label className="network-field-label" htmlFor="probe-prediction">
                Optional prediction
              </label>
              <select
                className="network-select network-select-wide"
                id="probe-prediction"
                onChange={(event) =>
                  dispatch({
                    type: "set-prediction",
                    prediction:
                      event.target.value === ""
                        ? undefined
                        : (event.target.value as "local" | "remote"),
                  })
                }
                value={lesson.prediction ?? ""}
              >
                <option value="">No prediction</option>
                <option value="local">Local / direct</option>
                <option value="remote">Remote / router</option>
              </select>
            </div>
            <div className="probe-actions">
              <button
                className="network-button network-button-primary"
                onClick={() => dispatch({ type: "send-probe" })}
                type="button"
              >
                Send probe <span aria-hidden="true">→</span>
              </button>
              <button
                className="network-button network-button-secondary"
                onClick={() => dispatch({ type: "reset" })}
                type="button"
              >
                Reset runtime
              </button>
            </div>
          </div>
          <p
            aria-live="polite"
            className={`probe-outcome probe-outcome-${selectedTrace?.outcome ?? "idle"}`}
          >
            {selectedTrace
              ? `${selectedTrace.outcome === "delivered" ? "Delivered" : "Stopped"} · ${selectedTraceTargetLabel} · ${selectedTrace.events.length} events`
              : "No probe sent yet. Configuration edits do not create history."}
          </p>
          {selectedTrace && selectedPrediction ? (
            <p className="probe-prediction-feedback" aria-live="polite">
              Prediction: <strong>{selectedPredictionLabel}</strong> · observed: {observedPathLabel}{" "}
              ·{" "}
              {observedPath
                ? selectedPrediction === observedPath
                  ? "match"
                  : "mismatch"
                : `validation stopped: ${validationReason ?? "no destination classification"}`}
            </p>
          ) : null}
        </section>

        <div className="evidence-grid">
          <section aria-labelledby="trace-heading" className="trace-card">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">CAUSAL TRACE</p>
                <h3 id="trace-heading">事件链</h3>
              </div>
              {selectedTrace ? <span className="trace-id">{selectedTrace.id}</span> : null}
            </div>
            {selectedTrace ? (
              <ol className="trace-list">
                {selectedTrace.events.map((event) => (
                  <li className={`trace-item trace-item-${event.outcome}`} key={event.id}>
                    <button
                      aria-current={lesson.selectedEvent?.id === event.id ? "step" : undefined}
                      className={`trace-event-button${lesson.selectedEvent?.id === event.id ? " is-selected" : ""}`}
                      onClick={() => dispatch({ type: "select-event", eventId: event.id })}
                      type="button"
                    >
                      <span className="trace-sequence">
                        {event.sequence.toString().padStart(2, "0")}
                      </span>
                      <span className="trace-event-copy">
                        <strong>{event.kind}</strong>
                        <span>
                          {event.actor} → {event.hop}
                        </span>
                      </span>
                      <span className="trace-event-outcome">{outcomeLabel(event)}</span>
                    </button>
                    <p>
                      {event.reasonCode} · {event.reason}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-evidence">Send a probe to render its ordered causal chain.</p>
            )}
          </section>

          <aside aria-label="Probe evidence" className="probe-evidence-card">
            <section className="failure-panel" aria-labelledby="failure-heading">
              <p className="eyebrow">FIRST FAILURE</p>
              <h3 id="failure-heading">
                {selectedFailure ? selectedFailure.reasonCode : "No stopped event"}
              </h3>
              <p>
                {selectedFailure
                  ? `Event ${selectedFailure.sequence}: ${selectedFailure.reason}`
                  : "A delivered trace has no first failure."}
              </p>
            </section>
            <section className="selected-event-panel" aria-labelledby="selected-event-heading">
              <p className="eyebrow">SELECTED EVENT</p>
              <h3 id="selected-event-heading">{lesson.selectedEvent?.kind ?? "Choose an event"}</h3>
              {lesson.selectedEvent ? (
                <div className="packet-details">
                  <span>{lesson.selectedEvent.reasonCode}</span>
                  <code>{packetLabel(lesson.selectedEvent.packet)}</code>
                  {lesson.selectedEvent.transformedPacket ? (
                    <code>
                      after headers · {packetLabel(lesson.selectedEvent.transformedPacket)}
                    </code>
                  ) : null}
                </div>
              ) : (
                <p>Event packet details appear here.</p>
              )}
            </section>
          </aside>
        </div>

        <section aria-labelledby="history-heading" className="history-card">
          <div className="network-card-heading">
            <div>
              <p className="eyebrow">IMMUTABLE HISTORY</p>
              <h3 id="history-heading">Probe history comparison</h3>
            </div>
            <span>
              {lesson.probeHistory.length} probe{lesson.probeHistory.length === 1 ? "" : "s"}
            </span>
          </div>
          {lesson.probeHistory.length ? (
            <div className="history-layout">
              <ol className="history-list">
                {lesson.probeHistory.map((probe, index) => (
                  <li key={probe.id}>
                    <button
                      className={`history-item${selectedTrace?.id === probe.id ? " is-selected" : ""}`}
                      onClick={() => dispatch({ type: "select-history", probeId: probe.id })}
                      type="button"
                    >
                      <span>#{index + 1}</span>
                      <strong>{probe.target}</strong>
                      <span>{probe.outcome}</span>
                      <small>{probe.events.length} events</small>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="history-comparison" aria-label="Selected probe snapshot comparison">
                {comparisonTrace ? (
                  <>
                    <p className="eyebrow">SELECTED SNAPSHOT</p>
                    <p>Comparing {comparisonTrace.id} with the current editable configuration.</p>
                    <dl>
                      <div>
                        <dt>Laptop</dt>
                        <dd>
                          {comparisonTrace.configSnapshot.laptop.ip}/
                          {comparisonTrace.configSnapshot.laptop.prefix} · gw{" "}
                          {comparisonTrace.configSnapshot.laptop.gateway}
                        </dd>
                      </div>
                      <div>
                        <dt>Printer</dt>
                        <dd>
                          {comparisonTrace.configSnapshot.printer.ip}/
                          {comparisonTrace.configSnapshot.printer.prefix} · gw{" "}
                          {comparisonTrace.configSnapshot.printer.gateway}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p>Select an earlier probe to compare its deep-cloned configuration snapshot.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-evidence">
              History is immutable and will appear after the first Send probe action.
            </p>
          )}
        </section>
      </div>
    </LabShell>
  );
}

export function HomeNetworkPage() {
  const search = useSearch({ from: "/labs/home-network" });
  return <HomeNetworkContent search={search} />;
}

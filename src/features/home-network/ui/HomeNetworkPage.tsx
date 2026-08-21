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
  if (event.outcome === "fail") return "已停止";
  if (event.outcome === "reply") return "已回复";
  if (event.outcome === "complete") return "已完成";
  return "通过";
}

const EVENT_KIND_LABELS: Record<string, string> = {
  "route-lookup": "路由查询",
  "arp-next-hop": "ARP 查找下一跳",
  "address-validation": "地址校验",
  "destination-classification": "目标分类",
  "transmit-request": "发送请求",
  "transmit-reply": "发送回复",
  "target-response": "目标响应",
  "probe-complete": "探针完成",
  "nat-request": "NAT 请求",
  "reverse-nat": "反向 NAT",
};

const REASON_LABELS: Record<string, string> = {
  "address-valid": "地址有效。",
  "invalid-ip": "IP 地址格式无效。",
  "invalid-prefix": "前缀长度无效。",
  "network-address": "地址是网络地址，不能作为主机地址。",
  "broadcast-address": "地址是广播地址，不能作为主机地址。",
  "duplicate-address": "检测到重复地址。",
  "route-to-lan": "目标位于局域网，选择直接路径。",
  "route-to-internet": "目标位于外部网络，选择路由器路径。",
  "destination-local": "目标与源在同一局域网。",
  "destination-remote": "目标不在源的局域网。",
  "gateway-unresolved": "无法解析默认网关。",
  "wrong-endpoint": "当前端点不是目标。",
  "frame-sent": "链路层帧已发送。",
  "direct-delivery": "请求直接送达目标。",
  "target-replied": "目标返回了响应。",
  "probe-complete": "探针完成。",
  "nat-applied": "路由器应用了网络地址转换。",
  "reverse-nat-applied": "路由器应用了反向网络地址转换。",
};

function eventKindLabel(kind: string): string {
  return EVENT_KIND_LABELS[kind] ?? kind;
}

function reasonLabel(reasonCode: string): string {
  return REASON_LABELS[reasonCode] ?? "事件结果已记录。";
}

function deviceName(name: string): string {
  return name === "Internet" ? "互联网" : name;
}

function deviceKindLabel(kind: string): string {
  return (
    { laptop: "学习电脑", printer: "打印机", router: "路由器", internet: "互联网" }[kind] ?? kind
  );
}

function probeTargetLabel(target: string): string {
  return target === "printer" ? "打印机" : "互联网";
}

function packetLabel(packet: ProbeEvent["packet"]): string {
  return `${packet.sourceIp} → ${packet.destinationIp} · 下一跳 ${packet.nextHopIp || "未选择"}`;
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
  const selectedTraceTargetLabel = selectedTrace?.target === "printer" ? "打印机" : "互联网";
  const selectedPrediction = selectedTrace ? lesson.probePredictions[selectedTrace.id] : undefined;
  const selectedPredictionLabel = selectedPrediction === "local" ? "本地 / 直接" : "远程 / 路由器";
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
      ? "本地 / 直接"
      : "远程 / 路由器"
    : "未分类";
  const validationReasonCode = selectedTrace?.firstFailure?.reasonCode;

  const editField = (field: "ip" | "prefix" | "gateway", value: string) => {
    if (lesson.selectedDevice === "laptop" || lesson.selectedDevice === "printer") {
      dispatch({ type: "edit-config", device: lesson.selectedDevice, field, value });
    }
  };

  return (
    <LabShell eyebrow="NETWORK / 01" title="家庭网络探针" subtitle="地址、ARP、路由与 NAT">
      <div className="home-network-page">
        <header className="network-lesson-intro">
          <div>
            <p className="eyebrow">家庭网络 / 探针</p>
            <h2>找出数据包第一次被拦住的地方</h2>
            <p>家庭局域网使用 192.168.1.0/24。</p>
          </div>
          <div className="scenario-chip" aria-label={`预设情境 ${lesson.scenario}`}>
            <span>预设</span>
            <strong>{lesson.scenario}</strong>
          </div>
        </header>

        <div className="network-workspace">
          <section className="network-canvas-card" aria-labelledby="topology-heading">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">网络拓扑</p>
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
              <title id="home-network-graph-title">家庭网络拓扑</title>
              <desc id="home-network-graph-description">
                路由器连接学习电脑、打印机和互联网端点。
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
                    aria-label={`${deviceName(device.name)}，${deviceAddress(device)}`}
                    className={`network-topology-node network-node-${device.kind}${selected ? " is-selected" : ""}`}
                    key={device.id}
                    role="img"
                  >
                    <title>{`${deviceName(device.name)}，${deviceAddress(device)}`}</title>
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
            </div>
            <div className="network-device-list" aria-label="网络设备">
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
                    <strong>{deviceName(device.name)}</strong>
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
                  <strong>互联网</strong>
                  <small>{INTERNET_ENDPOINT.ip}/24</small>
                </span>
              </button>
            </div>
          </section>

          <aside aria-label="网络设备信息" className="network-inspector-card">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">设备信息</p>
                <h3>设备配置</h3>
              </div>
              <span className="inspector-lock">源：学习电脑</span>
            </div>
            <label className="network-field-label" htmlFor="device-inspector">
              选择设备
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
              <option value="internet">互联网</option>
            </select>
            <p className="network-field-help">选择设备查看配置。</p>

            <div className="network-inspector-details">
              {selectedDevice ? (
                <>
                  <div className="device-detail-heading">
                    <span className="detail-device-kind">
                      {deviceKindLabel(selectedDevice.kind)}
                    </span>
                    <strong>{deviceName(selectedDevice.name)}</strong>
                  </div>
                  {selectedDevice.id === "router" ? (
                    <div className="fixed-route-list">
                      <strong>接口</strong>
                      <span>
                        LAN · {selectedDevice.lanIp}/{selectedDevice.lanPrefix}
                      </span>
                      <span>
                        WAN · {selectedDevice.wanIp}/{selectedDevice.wanPrefix}
                      </span>
                      <strong>已连接路由</strong>
                      {selectedDevice.connectedRoutes.map((route) => (
                        <span key={route}>{route}</span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label className="network-field-label" htmlFor="device-ip">
                        IPv4 地址
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
                        使用四段十进制八位组。
                      </p>
                      <label className="network-field-label" htmlFor="device-prefix">
                        前缀长度
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
                        只有 /1 到 /30 的整数前缀有效。
                      </p>
                      {selectedDevice.id !== "internet" ? (
                        <>
                          <label className="network-field-label" htmlFor="device-gateway">
                            默认网关
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
                            网关解析会在 ARP 阶段检查，而不是在预检阶段检查。
                          </p>
                        </>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <p>互联网探针端点：203.0.113.10/24。</p>
              )}
            </div>
          </aside>
        </div>

        <section aria-labelledby="probe-heading" className="probe-control-card">
          <div className="network-card-heading">
            <div>
              <p className="eyebrow">发送探针</p>
              <h3 id="probe-heading">选择目标并预测路径</h3>
            </div>
            <span className="source-chip">源 · 学习电脑 · {lesson.config.laptop.ip}</span>
          </div>
          <div className="probe-control-grid">
            <div>
              <label className="network-field-label" htmlFor="probe-target">
                探针目标
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
                <option value="internet">互联网 · {INTERNET_ENDPOINT.ip}</option>
              </select>
            </div>
            <div>
              <label className="network-field-label" htmlFor="probe-prediction">
                可选预测
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
                <option value="">不预测</option>
                <option value="local">本地 / 直接</option>
                <option value="remote">远程 / 路由器</option>
              </select>
            </div>
            <div className="probe-actions">
              <button
                className="network-button network-button-primary"
                onClick={() => dispatch({ type: "send-probe" })}
                type="button"
              >
                发送探针 <span aria-hidden="true">→</span>
              </button>
              <button
                className="network-button network-button-secondary"
                onClick={() => dispatch({ type: "reset" })}
                type="button"
              >
                恢复运行状态
              </button>
            </div>
          </div>
          <p
            aria-live="polite"
            className={`probe-outcome probe-outcome-${selectedTrace?.outcome ?? "idle"}`}
          >
            {selectedTrace
              ? `${selectedTrace.outcome === "delivered" ? "已送达" : "已停止"} · ${selectedTraceTargetLabel} · ${selectedTrace.events.length} 个事件`
              : "尚未发送探针。配置编辑不会创建历史记录。"}
          </p>
          {selectedTrace && selectedPrediction ? (
            <p className="probe-prediction-feedback" aria-live="polite">
              预测：<strong>{selectedPredictionLabel}</strong> · 实际：{observedPathLabel} ·{" "}
              {observedPath
                ? selectedPrediction === observedPath
                  ? "一致"
                  : "不一致"
                : `校验停止：${validationReasonCode ? reasonLabel(validationReasonCode) : "没有目标分类"}`}
            </p>
          ) : null}
        </section>

        <div className="evidence-grid">
          <section aria-labelledby="trace-heading" className="trace-card">
            <div className="network-card-heading">
              <div>
                <p className="eyebrow">过程记录</p>
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
                        <strong>{eventKindLabel(event.kind)}</strong>
                        <span>
                          {deviceName(event.actor)} → {deviceName(event.hop)}
                        </span>
                      </span>
                      <span className="trace-event-outcome">{outcomeLabel(event)}</span>
                    </button>
                    <p>
                      {event.reasonCode} · {reasonLabel(event.reasonCode)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-evidence">发送探针后显示事件顺序与原因。</p>
            )}
          </section>

          <aside aria-label="探针结果" className="probe-evidence-card">
            <section className="failure-panel" aria-labelledby="failure-heading">
              <p className="eyebrow">第一个失败</p>
              <h3 id="failure-heading">
                {selectedFailure ? selectedFailure.reasonCode : "没有停止事件"}
              </h3>
              <p>
                {selectedFailure
                  ? `事件 ${selectedFailure.sequence}：${reasonLabel(selectedFailure.reasonCode)}`
                  : "已送达的记录没有第一个失败。"}
              </p>
            </section>
            <section className="selected-event-panel" aria-labelledby="selected-event-heading">
              <p className="eyebrow">选中事件</p>
              <h3 id="selected-event-heading">
                {lesson.selectedEvent
                  ? eventKindLabel(lesson.selectedEvent.kind)
                  : "选择事件查看数据包详情"}
              </h3>
              {lesson.selectedEvent ? (
                <div className="packet-details">
                  <span>{lesson.selectedEvent.reasonCode}</span>
                  <code>{packetLabel(lesson.selectedEvent.packet)}</code>
                  {lesson.selectedEvent.transformedPacket ? (
                    <code>变换后首部 · {packetLabel(lesson.selectedEvent.transformedPacket)}</code>
                  ) : null}
                </div>
              ) : null}
            </section>
          </aside>
        </div>

        <section aria-labelledby="history-heading" className="history-card">
          <div className="network-card-heading">
            <div>
              <p className="eyebrow">历史记录</p>
              <h3 id="history-heading">探针历史比较</h3>
            </div>
            <span>{lesson.probeHistory.length} 个探针</span>
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
                      <strong>{probeTargetLabel(probe.target)}</strong>
                      <span>{probe.outcome === "delivered" ? "已送达" : "已停止"}</span>
                      <small>{probe.events.length} 个事件</small>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="history-comparison" aria-label="选中探针快照比较">
                {comparisonTrace ? (
                  <>
                    <p className="eyebrow">选中快照</p>
                    <p>比较 {comparisonTrace.id} 与当前可编辑配置。</p>
                    <dl>
                      <div>
                        <dt>学习电脑</dt>
                        <dd>
                          {comparisonTrace.configSnapshot.laptop.ip}/
                          {comparisonTrace.configSnapshot.laptop.prefix} · gw{" "}
                          {comparisonTrace.configSnapshot.laptop.gateway}
                        </dd>
                      </div>
                      <div>
                        <dt>打印机</dt>
                        <dd>
                          {comparisonTrace.configSnapshot.printer.ip}/
                          {comparisonTrace.configSnapshot.printer.prefix} · gw{" "}
                          {comparisonTrace.configSnapshot.printer.gateway}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p>选择更早的探针，比较它保存的配置快照。</p>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-evidence">发送探针后显示历史记录。</p>
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

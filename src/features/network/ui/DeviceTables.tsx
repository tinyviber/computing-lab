/**
 * Live device tables at the trace cursor: every switch's MAC table (the
 * star of stage 2), plus interface/route views for the selected device.
 * `macsAtCursor` comes from the trace row snapshots, so scrubbing the
 * timeline shows the table as it was at that moment.
 */

import { formatIp, formatMask, parseIp } from "../domain/addressing.ts";
import type { NetNode, NetTopology } from "../domain/topology.ts";

function ownerLabel(net: NetTopology, mac: string): string {
  for (const node of net.nodes) {
    for (const port of node.ports) {
      if (port.mac === mac) return node.label;
    }
  }
  return mac;
}

export function DeviceTables(props: {
  net: NetTopology;
  selected: NetNode | null;
  macsAtCursor: Record<string, Record<string, string>> | null;
}) {
  const { net, selected, macsAtCursor } = props;
  const switches = net.nodes.filter((n) => n.kind === "switch");
  return (
    <section aria-label="设备表" className="net-tables">
      {switches.map((sw) => {
        const table = macsAtCursor?.[sw.id] ?? {};
        const rows = Object.entries(table);
        return (
          <div className="net-table-block" key={sw.id}>
            <h4>
              {sw.label} · MAC 表{macsAtCursor ? "" : "（当前）"}
            </h4>
            {rows.length === 0 ? (
              <p className="net-table-empty">还没有学到任何条目——发一笔 ping 试试。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>设备</th>
                    <th>MAC</th>
                    <th>端口</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([mac, port]) => (
                    <tr key={mac}>
                      <td>{ownerLabel(net, mac)}</td>
                      <td>
                        <code>{mac}</code>
                      </td>
                      <td>
                        <code>{port}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {selected?.kind === "router" ? (
        <div className="net-table-block">
          <h4>{selected.label} · 路由表（按前缀长度排序）</h4>
          <table>
            <thead>
              <tr>
                <th>目的网段</th>
                <th>下一跳</th>
              </tr>
            </thead>
            <tbody>
              {(selected.routes ?? [])
                .slice()
                .sort((a, b) => {
                  const pa = Number(a.prefix.split("/")[1] ?? 0);
                  const pb = Number(b.prefix.split("/")[1] ?? 0);
                  return pb - pa;
                })
                .map((r, i) => (
                  <tr key={i}>
                    <td>
                      <code>{r.prefix}</code>
                    </td>
                    <td>
                      <code>{r.nextHop}</code>
                    </td>
                  </tr>
                ))}
              {selected.ports
                .filter((p) => p.ip)
                .map((p) => {
                  const prefix = p.mask?.startsWith("/") ? Number(p.mask.slice(1)) : 0;
                  const ip = parseIp(p.ip!);
                  if (ip === null) return null;
                  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
                  return (
                    <tr className="net-route-direct" key={`d-${p.id}`}>
                      <td>
                        <code>{`${formatIp((ip & mask) >>> 0)}/${prefix}`}</code>
                      </td>
                      <td>直连（{p.id}）</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected && selected.kind !== "switch" ? (
        <div className="net-table-block">
          <h4>{selected.label} · 接口</h4>
          <table>
            <thead>
              <tr>
                <th>端口</th>
                <th>IP / 掩码</th>
                <th>MAC</th>
              </tr>
            </thead>
            <tbody>
              {selected.ports.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.id}</code>
                  </td>
                  <td>
                    <code>
                      {p.ip ?? "—"}{" "}
                      {p.mask ? `（${formatMask(Number(p.mask.slice(1)) || 0)}）` : ""}
                    </code>
                  </td>
                  <td>
                    <code>{p.mac ?? "—"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

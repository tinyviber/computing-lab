# Home Network — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/home-network`.

## Intended objective

Use host prefix to classify direct/local versus remote traffic; use default gateway for off-subnet traffic; follow neighbor resolution, connected routes, router forwarding, NAT, and return path in the probe trace. The simulator has a fixed LAN/WAN topology and editable laptop/printer configuration. DHCP fallback and guest-network isolation are transfer concepts, not currently simulated mechanisms.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Probed printer, fixed its subnet, then probed Internet and removed gateway. | Local traffic can work without gateway; remote traffic needs gateway and return path. | Gateway, router, and next-hop words blurred. |
| Impatient explorer | Used wrong-printer and wrong-gateway presets; watched success/failure banners. | First failed hop explains much of the outcome. | `invalid-ip` on an empty gateway felt misleading. |
| Careful low-prior | Compared prefix, route, ARP/NAT, and history snapshots. | A router is a device; a gateway is the host’s chosen next hop. | Prefix/egress/NAT labels dense. |
| Strong computing | Widened prefix, broke return path, and checked alternate scenarios. | Outbound success is not full success; reply path matters. | DHCP/guest isolation not directly represented. |

## Observed interaction

The fixed topology and editable endpoint cards were immediately understandable. Default printer mismatch showed router reachability without a usable route; changing printer to `192.168.1.20` made local delivery direct. Internet probe exposed gateway, router, NAT, WAN, and return events. Clearing the laptop gateway left local printing working but stopped Internet. All four solved transfer: gateway for off-subnet websites; `169.254.x.x` suggests DHCP failure/renew; guest web access with NAS isolation points to policy/SSID, not a new address.

## Alignment

**Strong core; partial terminology and transfer boundary.** Route/prefix/gateway/NAT evidence aligned. DHCP and guest isolation are valid transfer questions but outside the current simulator, so a teacher must mark them as “apply the model beyond this topology,” not as hidden controls.

## 5–15 minute teacher flow

Hook: printer works? Website works? Commit before probing. Run default local mismatch; ask “what does the prefix say, and where does the first failure occur?” Fix only printer address. Contrast local printer with Internet, then remove laptop gateway. Name direct delivery, default gateway, route, NAT, and return path. Transfer: 169.254 fallback and guest SSID/NAS policy. Teacher silence target: 3/5 for core route, 2/5 for out-of-model DHCP/guest cases.


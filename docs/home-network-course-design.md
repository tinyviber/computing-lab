# Home Network course design

**Status:** Batch 1 product pass; feature-local, static path model.

## Product promise

> See a symptom, send one probe, find the first failure, change one configuration, and probe again.

This Lab is a troubleshooting investigation, not a real network simulator. The learner should first see a neutral symptom and target. ARP, route, and NAT facts are evidence revealed by the probe, not answer text in the preset name.

## Learner trajectory

1. Read the symptom and target.
2. Send a probe and locate the first failed event.
3. Open “Why?” to inspect ARP, route, and NAT evidence.
4. Edit the laptop or printer configuration.
5. Send the same target probe again and compare history snapshots.
6. Treat the mission as solved only when the latest probe is delivered using the current configuration.

`missionSolved` belongs to lesson state. Editing any configuration invalidates the previous success until a new probe is sent. The domain only returns probe facts.

## Scenario and URL contract

The first product pass supports only these existing scenario IDs:

`first-home-setup`, `static-printer`, `remote-internet`, `wrong-gateway`, `duplicate-ip`, `invalid-config`.

The only URL keys are `scenario` and `target`. The first repeated value wins; an unknown scenario falls back to `static-printer`; an unknown target falls back to that scenario's default target. Probe history, selected event, prediction, edits, and `missionSolved` are transient and stay out of the URL.

DHCP, Wi-Fi, real sockets, free topology editing, and a future `fault` schema are outside this pass.

## Evidence contract

`runHomeNetworkProbe` remains the sole domain oracle for address validation, ARP resolution, route selection, NAT, reply delivery, and first failure. UI must not recompute path semantics. The visible evidence must include textual outcome, first failure, packet details, and an expandable “Why?” path summary; color or animation is never the only signal.

## Acceptance

- Direct URL opens a scenario with symptom and target visible immediately.
- First probe shows delivered or the first stopped event.
- Editing config does not append history and invalidates a prior mission success.
- A repaired configuration requires a second probe and reports delivered.
- Earlier probe snapshots remain selectable for comparison.
- Keyboard operation and narrow layouts remain usable.

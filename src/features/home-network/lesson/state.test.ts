import { describe, expect, it } from "vitest";
import { createNetworkConfig } from "../domain/model";
import { parseHomeNetworkScenario } from "./scenario";
import {
  createHomeNetworkLessonState,
  homeNetworkConfigMatchesLatestProbe,
  homeNetworkMissionSolved,
  transitionHomeNetworkLesson,
} from "./state";

describe("home network lesson reducer", () => {
  it("does not append history for edits, snapshots each probe, and reset clears history", () => {
    const scenario = parseHomeNetworkScenario("scenario=static-printer&target=printer");
    let state = createHomeNetworkLessonState(scenario);

    expect(state).toMatchObject({
      source: "laptop",
      target: "printer",
      selectedDevice: "laptop",
      probeHistory: [],
    });
    expect(homeNetworkMissionSolved(state)).toBe(false);

    state = transitionHomeNetworkLesson(state, {
      type: "edit-config",
      device: "printer",
      field: "ip",
      value: "192.168.1.30",
    });
    expect(state.config.printer.ip).toBe("192.168.1.30");
    expect(state.probeHistory).toHaveLength(0);

    state = transitionHomeNetworkLesson(state, { type: "send-probe" });
    expect(state.probeHistory).toHaveLength(1);
    expect(state.probeHistory[0].configSnapshot.printer.ip).toBe("192.168.1.30");
    expect(state.selectedTrace?.configSnapshot.printer.ip).toBe("192.168.1.30");

    state = transitionHomeNetworkLesson(state, {
      type: "set-config",
      config: createNetworkConfig({ printer: { ip: "192.168.1.31" } }),
    });
    expect(state.config.printer.ip).toBe("192.168.1.31");
    expect(state.probeHistory[0].configSnapshot.printer.ip).toBe("192.168.1.30");

    state = transitionHomeNetworkLesson(state, { type: "probe" });
    expect(state.probeHistory).toHaveLength(2);
    expect(state.probeHistory.map((probe) => probe.configSnapshot.printer.ip)).toEqual([
      "192.168.1.30",
      "192.168.1.31",
    ]);
    expect(new Set(state.probeHistory.map((probe) => probe.id)).size).toBe(2);
    expect(state.probePredictions).toEqual({
      [state.probeHistory[0].id]: undefined,
      [state.probeHistory[1].id]: undefined,
    });
    expect(homeNetworkMissionSolved(state)).toBe(true);
    expect(homeNetworkConfigMatchesLatestProbe(state)).toBe(true);

    state = transitionHomeNetworkLesson(state, { type: "reset" });
    expect(state.probeHistory).toEqual([]);
    expect(state.selectedTrace).toBeUndefined();
    expect(state.selectedEvent).toBeUndefined();
    expect(state.probePredictions).toEqual({});
    expect(homeNetworkMissionSolved(state)).toBe(false);
    expect(homeNetworkConfigMatchesLatestProbe(state)).toBe(false);
  });

  it("keeps missionSolved lesson-local and requires a successful re-probe after editing", () => {
    const scenario = parseHomeNetworkScenario("scenario=static-printer&target=printer");
    let state = createHomeNetworkLessonState(scenario);

    state = transitionHomeNetworkLesson(state, { type: "probe" });
    expect(state.probeHistory[0].outcome).toBe("blocked");
    expect(homeNetworkMissionSolved(state)).toBe(false);
    expect(homeNetworkConfigMatchesLatestProbe(state)).toBe(true);

    state = transitionHomeNetworkLesson(state, {
      type: "edit-config",
      device: "printer",
      field: "ip",
      value: "192.168.1.30",
    });
    expect(homeNetworkMissionSolved(state)).toBe(false);

    state = transitionHomeNetworkLesson(state, { type: "probe" });
    expect(state.probeHistory[1].outcome).toBe("delivered");
    expect(homeNetworkMissionSolved(state)).toBe(true);
    expect(state.probeHistory).toHaveLength(2);
  });

  it("stores optional path predictions by immutable probe id", () => {
    const scenario = parseHomeNetworkScenario("scenario=first-home-setup&target=printer");
    let state = createHomeNetworkLessonState(scenario);

    state = transitionHomeNetworkLesson(state, { type: "set-prediction", prediction: "local" });
    state = transitionHomeNetworkLesson(state, { type: "send-probe" });
    const firstProbe = state.probeHistory[0];

    state = transitionHomeNetworkLesson(state, { type: "set-prediction", prediction: "remote" });
    state = transitionHomeNetworkLesson(state, { type: "send-probe" });
    const secondProbe = state.probeHistory[1];

    expect(state.probePredictions[firstProbe.id]).toBe("local");
    expect(state.probePredictions[secondProbe.id]).toBe("remote");
    expect(firstProbe.events[0].id).not.toBe(secondProbe.events[0].id);
  });

  it("is idempotent for unknown trace and event selections", () => {
    const initial = createHomeNetworkLessonState(parseHomeNetworkScenario(""));
    const afterUnknownTrace = transitionHomeNetworkLesson(initial, {
      type: "select-trace",
      probeId: "missing-probe",
    });
    const afterUnknownEvent = transitionHomeNetworkLesson(initial, {
      type: "select-event",
      eventId: "missing-event",
    });

    expect(afterUnknownTrace).toBe(initial);
    expect(afterUnknownEvent).toBe(initial);
  });
});

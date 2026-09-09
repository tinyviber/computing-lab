import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const control = (name: RegExp) => screen.getByLabelText(name);
const button = (name: RegExp) => screen.getByRole("button", { name });

describe("Sound reference UI", () => {
  it("renders native labelled controls for the orthogonal Sound state", async () => {
    await renderAppAt("/labs/audio-encoding");

    expect(screen.getByRole("main", { name: /声音编码实验区/ })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(control(/^信号源$/)).toHaveValue("pure440");
    expect(control(/采样频率/)).toHaveValue("8000");
    expect(control(/量化位数/)).toHaveValue("8");
    expect(control(/^采样偏移$/)).toHaveValue("0");

    for (const name of [/^停止$/, /^播放$/, /^暂停$/, /原始信号/, /重建信号/]) {
      expect(button(name)).toBeInTheDocument();
    }
    for (const name of [
      /对照（compare）/,
      /混叠（aliasing）/,
      /量化（quantization）/,
      /采样点/,
      /量化级别/,
      /重建误差/,
    ]) {
      expect(button(name)).toBeInTheDocument();
    }
  });

  it("labels sample quantization statistics and continuous reconstruction error separately", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=1000&bitDepth=4");

    const metrics = screen.getByLabelText("声音读数");
    expect(within(metrics).getByText(/采样量化均方根误差/)).toBeInTheDocument();
    expect(within(metrics).getByText(/采样量化峰值误差/)).toBeInTheDocument();
    expect(screen.queryByText(/^均方根误差$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^峰值误差$/)).not.toBeInTheDocument();

    const readout = screen.getByLabelText("光标读数");
    expect(within(readout).getByText(/重建误差/)).toBeInTheDocument();

    await user.click(button(/^量化（quantization）$/));
    const evidence = screen.getByTestId("sound-quantization-evidence");
    expect(evidence).toHaveTextContent(/采样量化指标只在采样时刻测量/);
    expect(evidence).not.toHaveTextContent(/连续重建误差/);
  });

  it("uses milliseconds for speech and falls back through the controlled window select", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const source = control(/^信号源$/);
    const plotWindow = control(/波形窗口/);
    expect(plotWindow).toHaveValue("4");
    expect(plotWindow).toHaveTextContent(/4 个参考周期/);

    await user.selectOptions(source, "speech");
    expect(source).toHaveValue("speech");
    expect(plotWindow).toHaveValue("40");
    expect(plotWindow).toHaveTextContent(/40 毫秒/);
    expect(screen.queryByText(/参考周期/)).not.toBeInTheDocument();

    await user.selectOptions(source, "sawtooth");
    expect(source).toHaveValue("sawtooth");
    expect(plotWindow).toHaveValue("4");
    expect(plotWindow).toHaveTextContent(/4 个参考周期/);
  });

  it("starts speech with a 40 ms window and no periodic reference label", async () => {
    await renderAppAt("/labs/audio-encoding?source=speech");

    const plotWindow = control(/波形窗口/);
    expect(plotWindow).toHaveValue("40");
    expect(plotWindow).toHaveTextContent(/40 毫秒/);
    expect(screen.queryByText(/参考周期/)).not.toBeInTheDocument();
  });

  it("keeps source, audition, mode, and view changes orthogonal", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    await user.selectOptions(control(/^信号源$/), "sawtooth");
    await user.click(button(/^原始信号$/));
    await user.click(button(/^混叠（aliasing）$/));
    await user.click(button(/^重建误差$/));

    expect(control(/^信号源$/)).toHaveValue("sawtooth");
    expect(button(/^原始信号$/)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^混叠（aliasing）$/)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^重建误差$/)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^对照（compare）$/)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^量化（quantization）$/)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^采样点$/)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^量化级别$/)).toHaveAttribute("aria-pressed", "false");
  });

  it("supports keyboard-labelled controls without stealing focus", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const sampleRate = control(/采样频率/);
    sampleRate.focus();
    fireEvent.change(sampleRate, { target: { value: "16000" } });
    expect(sampleRate).toHaveFocus();
    expect(sampleRate).toHaveValue("16000");

    const source = control(/^信号源$/);
    source.focus();
    await user.selectOptions(source, "high-pulse");
    expect(source).toHaveFocus();
  });

  it("exposes a bounded polite live region and bounded accessible plot", async () => {
    await renderAppAt("/labs/audio-encoding?source=high-pulse&sampleRate=48000&bitDepth=16");

    const live = screen.getByText(/高频脉冲；已停止/);
    expect(live).toHaveAttribute("aria-live", "polite");
    expect((live.textContent ?? "").length).toBeLessThanOrEqual(240);

    const plot = screen.getByRole("img", { name: /波形图/ });
    expect(plot).toBeInTheDocument();
    expect(plot.getAttribute("aria-label")).toBeTruthy();
  });

  it("keeps the first render exploratory instead of revealing aliasing outcomes", async () => {
    await renderAppAt("/labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12");

    const firstRender = document.body.textContent ?? "";
    expect(firstRender).not.toMatch(/A high-frequency component is above the Nyquist limit/i);
    expect(firstRender).not.toMatch(/Folded frequency/i);
    expect(firstRender).not.toMatch(/至少一个可见频率分量高于.*奈奎斯特上限/);
    expect(firstRender).not.toMatch(/发生混叠.*折叠到/);
    expect(firstRender).not.toMatch(/所有频率分量都低于或恰在|每个可见频率分量都低于或恰在/);
    expect(firstRender).not.toMatch(/高于奈奎斯特频率|折叠后频率|频率分量混叠/);
    expect(firstRender).not.toMatch(
      /确定性的本地夹具|视觉时钟|显式步进|有界波形图|缓冲区|数据负载/,
    );
    expect(firstRender).toMatch(/实验建议/);
    expect(firstRender).toMatch(/每次只改采样率或位深中的一个/);
    expect(firstRender).toMatch(/试听使用 48 kHz/);
    expect(firstRender).toMatch(/量化位数（bit depth）/);
    expect(screen.getByRole("group", { name: "分析模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "混叠（aliasing）" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "声音读数" })).toHaveTextContent(/频率分量/);
  });

  it("does not write live URL state while interacting with Sound controls", async () => {
    const user = userEvent.setup();
    const { history } = await renderAppAt("/labs/audio-encoding");
    const initial = history.location.href;

    await user.selectOptions(control(/^信号源$/), "speech");
    await user.click(button(/^混叠（aliasing）$/));
    await user.click(button(/^重建误差$/));

    expect(history.location.href).toBe(initial);
  });

  it("renders real sample markers and bounded evidence for the Samples view", async () => {
    const user = userEvent.setup();
    await renderAppAt(
      "/labs/audio-encoding?source=speech&sampleRate=16000&bitDepth=8&phase=0.25&view=samples",
    );

    expect(button(/^采样点$/)).toHaveAttribute("aria-pressed", "true");
    const plot = screen.getByRole("img", { name: /采样点\s*波形图/ });
    expect(button(/^采样点$/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^采样点$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const markers = document.querySelectorAll(".sound-sample-marker");
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.length).toBeLessThanOrEqual(160);
    for (const marker of markers) {
      expect(marker.getAttribute("data-sample-index")).toMatch(/^\d+$/);
    }

    await user.click(button(/^量化级别$/));
    expect(screen.getByRole("button", { name: /^量化级别$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps complete level values and error evidence bounded in the DOM", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=sawtooth&sampleRate=48000&bitDepth=4");

    await user.click(button(/^量化（quantization）$/));
    await user.click(button(/^量化级别$/));
    const levelPreview = screen.getByTestId("sound-quantization-evidence");
    expect(levelPreview.querySelector("[data-level-count]")).toHaveAttribute(
      "data-level-count",
      "16",
    );
    expect(levelPreview.querySelectorAll(".sound-level-preview span").length).toBeLessThanOrEqual(
      24,
    );

    expect(document.querySelectorAll(".sound-level-line").length).toBeLessThanOrEqual(24);
    expect(document.querySelectorAll(".sound-sample-marker").length).toBeLessThanOrEqual(160);

    await user.click(button(/^重建误差$/));
    const errorPlot = screen.getByRole("img", { name: /重建误差\s*波形图/ });
    expect(button(/^重建误差$/)).toHaveAttribute("aria-pressed", "true");
    expect(errorPlot.querySelector(".sound-error-line")).toBeInTheDocument();
  });

  it("renders distinct compare, aliasing, and quantization evidence without scalar composite claims", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=speech&sampleRate=840&bitDepth=4");
    const plot = () => screen.getByRole("img", { name: /波形图/ });

    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "compare",
    );
    expect(screen.getByTestId("sound-compare-evidence")).toBeInTheDocument();
    expect(screen.queryByText(/折叠后频率/)).not.toBeInTheDocument();
    expect(screen.getByText(/只移动采样位置（0–0\.99 圈/)).toBeInTheDocument();
    expect(screen.getByText(/它不改变采样率/)).toBeInTheDocument();

    await user.click(button(/^混叠（aliasing）$/));
    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "aliasing",
    );
    const aliasingEvidence = screen.getByTestId("sound-aliasing-evidence");
    expect(aliasingEvidence).toBeInTheDocument();
    const evidenceTable = screen.getByRole("table");
    expect(evidenceTable).toHaveTextContent("180 Hz");
    expect(evidenceTable).toHaveTextContent("420 Hz");
    expect(evidenceTable).toHaveTextContent("780 Hz");
    expect(within(aliasingEvidence).getByText(/频率分量混叠结果/)).toBeInTheDocument();
    expect(screen.queryByText(/类语音.*低于.*奈奎斯特/)).not.toBeInTheDocument();

    await user.click(button(/^量化（quantization）$/));
    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "quantization",
    );
    const quantizationEvidence = screen.getByTestId("sound-quantization-evidence");
    expect(quantizationEvidence).toBeInTheDocument();
    expect(within(quantizationEvidence).getByText(/量化结果/)).toBeInTheDocument();
  });

  it("keeps aliasing and quantization evidence text-addressable after mode changes", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=high-pulse&sampleRate=8000&mode=aliasing");

    await user.click(screen.getByRole("button", { name: /混叠.*aliasing/ }));
    expect(screen.getByTestId("sound-aliasing-evidence")).toHaveTextContent(
      /奈奎斯特|Nyquist|混叠|aliased/i,
    );
    expect(screen.getByRole("img", { name: /波形图/ })).toHaveAccessibleName();

    await user.click(screen.getByRole("button", { name: /量化.*quantization/ }));
    expect(screen.getByTestId("sound-quantization-evidence")).toHaveTextContent(
      /量化级别|位数|quantization/i,
    );
    expect(screen.getByTestId("sound-audio-status")).toHaveTextContent(/已停止|就绪|ready/i);
  });

  it("keeps compare overlay and A/B audition selection as separate evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");

    const plot = screen.getByRole("img", { name: /波形图/ });
    expect(plot.querySelector(".sound-original-line")).toBeInTheDocument();
    expect(plot.querySelector(".sound-reconstructed-line")).toBeInTheDocument();

    await user.click(button(/^重建信号$/));
    expect(button(/^重建信号$/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^重建信号$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps an arbitrary URL sample rate visible until a precise ladder stop is chosen", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=840");

    const sampleRate = control(/采样频率/);
    expect(sampleRate.tagName).toBe("SELECT");
    expect(sampleRate).toHaveValue("840");
    expect(
      within(sampleRate).getByRole("option", { name: /840 Hz（情境值）/ }),
    ).toBeInTheDocument();
    expect(within(sampleRate).getByRole("option", { name: /^880 Hz$/ })).toBeInTheDocument();
    const optionValues = within(sampleRate)
      .getAllByRole("option")
      .map((option) => Number((option as HTMLOptionElement).value));
    expect(optionValues).toEqual(
      expect.arrayContaining([800, 880, 960, 3600, 3960, 4320, 12000, 24000]),
    );

    await user.selectOptions(sampleRate, "880");
    expect(sampleRate).toHaveValue("880");
  });

  it("changes an explicit plot time window without increasing the bounded plot", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=sawtooth&sampleRate=8000&bitDepth=8");

    const plot = screen.getByRole("img", { name: /波形图/ });
    const initialEnd = plot.getAttribute("data-time-window-end");
    const initialPoints = plot.querySelectorAll(".sound-original-line circle").length;

    await user.selectOptions(screen.getByLabelText(/波形窗口/), "1");
    expect(plot.getAttribute("data-time-window-end")).not.toBe(initialEnd);
    expect(plot.querySelectorAll(".sound-original-line circle").length).toBeLessThanOrEqual(360);
    expect(initialPoints).toBeLessThanOrEqual(360);
  });

  it("keeps the plot header's window width correct after a centered seek", async () => {
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");

    const header = document.querySelector(".sound-panel-header code");
    const cursor = document.querySelector("#sound-cursor") as HTMLInputElement;
    expect(header).not.toBeNull();
    fireEvent.change(cursor, { target: { value: "500.25" } });

    expect(header).toHaveTextContent(/9\.1 毫秒窗口/);
    expect(header).not.toHaveTextContent(/504\.8 毫秒窗口/);
  });

  it("shows real full-range quantization codes in a bounded preview", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=16");
    await user.click(button(/^量化（quantization）$/));
    await user.click(button(/^量化级别$/));

    const evidence = screen.getByTestId("sound-quantization-evidence");
    const levels = evidence.querySelectorAll("[data-level-code]");
    expect(levels.length).toBeGreaterThanOrEqual(2);
    expect(levels.length).toBeLessThanOrEqual(24);
    expect(levels[0]).toHaveAttribute("data-level-code", "0");
    expect(levels[0]).toHaveAttribute("data-level-value", "-1");
    expect(levels[levels.length - 1]).toHaveAttribute("data-level-code", "65535");
    expect(levels[levels.length - 1]).toHaveAttribute("data-level-value", "1");
    expect(evidence).toHaveTextContent(/共 65536 个量化级别/);
  });

  it("keeps pure440 sample markers dense and aligned to dynamic local time", async () => {
    const user = userEvent.setup();
    await renderAppAt(
      "/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8&view=samples",
    );

    const plot = screen.getByRole("img", { name: /采样点\s*波形图/ });
    await user.selectOptions(screen.getByLabelText(/波形窗口/), "1");

    const startMs = Number(plot.getAttribute("data-time-window-start"));
    const endMs = Number(plot.getAttribute("data-time-window-end"));
    expect(endMs).toBeGreaterThan(startMs);

    const markers = [...plot.querySelectorAll<SVGCircleElement>(".sound-sample-marker")];
    expect(markers.length).toBeGreaterThan(1);
    for (const marker of markers) {
      const timestampMs = Number(marker.getAttribute("data-sample-timestamp-ms"));
      const cx = Number(marker.getAttribute("cx"));
      const expectedCx = ((timestampMs - startMs) / (endMs - startMs)) * 100;

      expect(timestampMs).toBeGreaterThanOrEqual(startMs);
      expect(timestampMs).toBeLessThanOrEqual(endMs);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(100);
      expect(cx).toBeCloseTo(expectedCx, 5);
    }

    const initialStart = Number(plot.getAttribute("data-time-window-start"));
    const initialEnd = Number(plot.getAttribute("data-time-window-end"));
    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    fireEvent.change(cursorInput, { target: { value: "500.25" } });

    const shiftedStart = Number(plot.getAttribute("data-time-window-start"));
    const shiftedEnd = Number(plot.getAttribute("data-time-window-end"));
    expect(shiftedStart).not.toBe(initialStart);
    expect(shiftedEnd).not.toBe(initialEnd);

    const shiftedMarkers = [...plot.querySelectorAll<SVGCircleElement>(".sound-sample-marker")];
    expect(shiftedMarkers.length).toBeGreaterThan(1);
    for (const marker of shiftedMarkers) {
      const timestampMs = Number(marker.getAttribute("data-sample-timestamp-ms"));
      const cx = Number(marker.getAttribute("cx"));
      expect(cx).toBeCloseTo(((timestampMs - shiftedStart) / (shiftedEnd - shiftedStart)) * 100, 5);
    }
  });

  it("uses sub-ms high-pulse cursor precision and keeps a distant seek centered in the plot", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");

    await user.selectOptions(control(/^信号源$/), "high-pulse");
    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    expect(Number(cursorInput.getAttribute("step"))).toBeGreaterThan(0);
    expect(Number(cursorInput.getAttribute("step"))).toBeLessThan(1);
    expect(document.querySelector('label[for="sound-cursor"]')).toHaveTextContent(
      /\d+\.\d+\s*\/\s*1000 ms/,
    );

    const plot = screen.getByRole("img", { name: /波形图/ });
    const initialStart = Number(plot.getAttribute("data-time-window-start"));
    const initialEnd = Number(plot.getAttribute("data-time-window-end"));
    fireEvent.change(cursorInput, { target: { value: "500.25" } });

    const actualCursorMs = Number(cursorInput.value);
    const shiftedStart = Number(plot.getAttribute("data-time-window-start"));
    const shiftedEnd = Number(plot.getAttribute("data-time-window-end"));
    expect(actualCursorMs).toBeCloseTo(500.25, 2);
    expect(shiftedStart).not.toBe(initialStart);
    expect(shiftedEnd).not.toBe(initialEnd);
    expect(actualCursorMs).toBeGreaterThan(shiftedStart);
    expect(actualCursorMs).toBeLessThan(shiftedEnd);

    const cursorLine = plot.querySelector<SVGLineElement>(".sound-cursor-line");
    expect(cursorLine).not.toBeNull();
    expect(Number(cursorLine?.getAttribute("x1"))).toBeCloseTo(50, 0);
  });

  it("shows static experiment suggestions without interpreting interaction as progress", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const suggestions = screen.getByTestId("sound-experiment-suggestions");
    expect(suggestions).toHaveTextContent("不知道从哪里开始？可以试试");
    expect(suggestions).toHaveTextContent("这里没有必须遵循的顺序");
    expect(suggestions).toHaveTextContent("每次只改采样率或位深中的一个");
    expect(suggestions).not.toHaveAttribute("data-active-step");
    expect(document.querySelectorAll("[data-step-state]")).toHaveLength(0);

    await user.click(button(/^混叠（aliasing）$/));

    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    fireEvent.change(cursorInput, { target: { value: "200" } });
    expect(suggestions).not.toHaveAttribute("data-active-step");
  });

  it("steps the cursor forward 100 ms from the stopped state and keeps playback running while playing", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    const stepButton = button(/前进 100 毫秒/);
    expect(stepButton).toBeEnabled();

    // 停止态步进：光标 +100ms，不进入播放。
    await user.click(stepButton);
    expect(cursorInput.value).toBe("100");
    expect(document.querySelector(".sound-transport-badge")).toHaveTextContent("已停止");

    // 选择分析模式后，停止态步进仍只是 seek，不产生学习进度。
    await user.click(button(/^量化（quantization）$/));
    await user.click(stepButton);
    expect(cursorInput.value).toBe("200");
    expect(screen.getByTestId("sound-experiment-suggestions")).toBeInTheDocument();

    // 播放态步进：不中断播放。
    await user.click(button(/^播放$/));
    expect(document.querySelector(".sound-transport-badge")).toHaveTextContent("播放中");
    await user.click(stepButton);
    expect(document.querySelector(".sound-transport-badge")).toHaveTextContent("播放中");
    expect(Number(cursorInput.value)).toBeGreaterThanOrEqual(200);
  });

  it("keeps an A/B comparison note with open observation text", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?sampleRate=8000");

    const card = screen.getByTestId("sound-evidence-card");
    expect(within(card).getAllByText("尚未记录")).toHaveLength(2);
    expect(within(card).getByText(/还没有 A 记录/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "记录当前设置为 A" }));
    expect(within(card).getByText(/A 已保存在这里/)).toBeInTheDocument();
    expect(within(card).getByText("8000 Hz · 8 bit")).toBeInTheDocument();

    await user.selectOptions(control(/采样频率/), "3600");
    await user.click(within(card).getByRole("button", { name: "记录当前设置为 B" }));
    expect(within(card).getByText("3600 Hz · 8 bit")).toBeInTheDocument();

    const observation = within(card).getByRole("textbox", { name: /我的观察/ });
    await user.type(observation, "从 8000 改到 3600 后，音调变闷了。");
    expect(observation).toHaveValue("从 8000 改到 3600 后，音调变闷了。");
    expect(within(card).getByText(/A 和 B 都保存在这里/)).toBeInTheDocument();
    expect(card).not.toHaveAttribute("data-evidence-state");
    expect(card).not.toHaveTextContent(/未完成|已完成|success/i);
  });

  it("keeps identical settings as a valid comparison note", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const card = screen.getByTestId("sound-evidence-card");
    await user.click(within(card).getByRole("button", { name: "记录当前设置为 A" }));
    await user.click(within(card).getByRole("button", { name: "记录当前设置为 B" }));
    expect(within(card).getAllByText("8000 Hz · 8 bit")).toHaveLength(2);
    expect(within(card).queryByText(/两次设置的采样率和位深相同/)).not.toBeInTheDocument();
  });

  it("offers clear, self-explaining resets without wiping recorded notes", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    expect(button(/光标回到开头/)).toBeInTheDocument();
    expect(button(/重置实验与视图/)).toBeInTheDocument();
    expect(button(/恢复初始设置并清空记录/)).toBeInTheDocument();
    expect(button(/光标回到开头/)).toHaveAttribute(
      "aria-label",
      "光标回到开头：停止播放、关闭循环并回到 0 毫秒，不影响你的记录",
    );
    expect(button(/重置实验与视图/)).toHaveAttribute(
      "aria-label",
      "重置实验与视图：回到对照模式与叠加视图，保留对比记录",
    );
    expect(button(/恢复初始设置并清空记录/)).toHaveAttribute(
      "aria-label",
      "恢复初始设置并清空记录：回到进入本页时的设置",
    );
    expect(
      screen.getByText(/重置分析与视图.*保留对比记录.*恢复初始设置并清空记录.*A\/B 笔记/),
    ).toBeInTheDocument();

    const card = screen.getByTestId("sound-evidence-card");
    await user.click(within(card).getByRole("button", { name: "记录当前设置为 A" }));
    await user.selectOptions(control(/采样频率/), "3600");
    await user.click(within(card).getByRole("button", { name: "记录当前设置为 B" }));

    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    fireEvent.change(cursorInput, { target: { value: "300" } });
    await user.click(button(/光标回到开头/));
    expect(cursorInput.value).toBe("0");

    await user.click(button(/混叠（aliasing）$/));
    await user.click(button(/重置实验与视图/));
    expect(button(/^对照（compare）$/)).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByText("8000 Hz · 8 bit")).toBeInTheDocument();
    expect(within(card).getByText("3600 Hz · 8 bit")).toBeInTheDocument();

    await user.click(button(/恢复初始设置并清空记录/));
    expect(within(card).getByText(/还没有 A 记录/)).toBeInTheDocument();
  });

  it("mentions the Nyquist frequency in compare evidence", async () => {
    await renderAppAt("/labs/audio-encoding?sampleRate=8000");

    expect(screen.getByTestId("sound-compare-evidence")).toHaveTextContent(
      /当前奈奎斯特频率为 4000 Hz/,
    );
  });
});

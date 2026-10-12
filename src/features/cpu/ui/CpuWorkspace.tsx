import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { Icon } from "../../../shared/ui/Icon";
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import type { CpuPhase, CpuWorkspaceProps } from "../controller/viewModel.ts";
import { BlockDiagram } from "./BlockDiagram.tsx";
import { BytePlayground } from "./BytePlayground.tsx";
import { CpuStageRail } from "./CpuStageRail.tsx";
import { CpuTestPanel } from "./CpuTestPanel.tsx";
import { GuidedPanel } from "./GuidedPanel.tsx";
import { InstructionShelf } from "./InstructionShelf.tsx";
import { MemoryGrid } from "./MemoryGrid.tsx";
import { ProgramEditor } from "./ProgramEditor.tsx";
import { RegistersPanel } from "./RegistersPanel.tsx";
import { TraceTable } from "./TraceTable.tsx";
import "./cpu.css";

const PHASES: { id: CpuPhase; label: string }[] = [
  { id: "fetch", label: "取指" },
  { id: "decode", label: "译码" },
  { id: "exec", label: "执行 · 周期末提交" },
];

/** Real presentation, also rendered in previews; teaching decisions arrive in model. */
export function CpuWorkspace({ model, actions }: CpuWorkspaceProps) {
  const { stage, feedback, editor, guide, bytePlayground, machine, submission } = model;
  return (
    <LabPageShell
      collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
      labId="cpu"
      rail={<CpuStageRail model={model.rail} onSelect={actions.selectStage} />}
    >
      <main aria-label="CPU 数据通路实验区" className="cpu-workspace">
        {feedback.recommendCalculator ? (
          <p className="cpu-gate-banner" role="note">
            建议先完成「实现ALU」前 6 关再来——这个实验会用到加法器和 ALU 的概念。
          </p>
        ) : null}
        {stage ? (
          <section className="stage-brief">
            <p>{stage.description}</p>
            <p className="cpu-task">
              <strong>任务：</strong>
              {stage.task}
            </p>
            <p className="submit-note">判题方式：{stage.judgeNote}</p>
            {stage.passed ? <p className="stage-takeaway">本关收获：{stage.takeaway}</p> : null}
            <HintDisclosure hint={stage.hint} />
          </section>
        ) : null}
        {stage ? <InstructionShelf ops={editor.ops} /> : null}
        {feedback.message ? (
          <p className="test-error" role="alert">
            {feedback.message}
            <button onClick={actions.dismissMessage} type="button">
              <Icon name="x" size={12} />
            </button>
          </p>
        ) : null}
        {feedback.error ? (
          <p className="test-error" role="alert">
            {feedback.error}
          </p>
        ) : null}
        {stage ? (
          <ProgramEditor
            {...editor}
            onInsertRow={actions.insertRow}
            onMoveRow={actions.moveRow}
            onRemoveRow={actions.removeRow}
            onSetRow={actions.setRow}
          />
        ) : null}
        {guide ? <GuidedPanel model={guide} onAnswer={actions.answerPrompt} /> : null}
        {bytePlayground ? <BytePlayground {...bytePlayground} onByte={actions.setByte} /> : null}
        {machine ? (
          <section aria-label="机器运行" className="cpu-machine">
            <div className="cpu-clock-row">
              <div className="cpu-clock-buttons">
                <button
                  className="button button-secondary"
                  disabled={!machine.canStep || machine.isRunning}
                  onClick={actions.step}
                  type="button"
                >
                  {machine.phase === "exec" ? "提交这一周期" : "下一拍"}
                </button>
                {machine.isRunning ? (
                  <button className="button button-secondary" onClick={actions.pause} type="button">
                    暂停
                  </button>
                ) : (
                  <button
                    className="button button-secondary"
                    disabled={!machine.canStep}
                    onClick={actions.run}
                    type="button"
                  >
                    {machine.runLabel}
                  </button>
                )}
                <button className="button button-ghost" onClick={actions.reset} type="button">
                  复位
                </button>
              </div>
              <div className="cpu-phasebar" key={machine.cursor}>
                {PHASES.map((p, i) => (
                  <button
                    aria-pressed={machine.diagram.pending !== null && machine.phase === p.id}
                    className={`cpu-phase cpu-phase-${p.id}${machine.diagram.pending && machine.phase === p.id ? " is-active" : ""}`}
                    disabled={!machine.canSelectPhase}
                    key={p.id}
                    onClick={() => actions.selectPhase(p.id)}
                    type="button"
                  >
                    {i > 0 ? <span className="cpu-phase-arrow">→</span> : null}
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="cpu-case-picker">
                演示数据
                {machine.casePinned ? (
                  <span className="cpu-case-pin" role="note">
                    已锁定到本题的数据
                  </span>
                ) : null}
                <select
                  disabled={!machine.canSelectCase}
                  onChange={(event) => {
                    if (event.target.value !== "replay")
                      actions.selectCase(Number(event.target.value));
                  }}
                  value={machine.caseValue}
                >
                  {machine.cases.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="cpu-cycle-count">{machine.cycleLabel}</span>
            </div>
            {machine.blockingNote ? (
              <p className="cpu-block-banner" role="note">
                {machine.blockingNote}
              </p>
            ) : null}
            <div className="cpu-viz-grid">
              <RegistersPanel {...machine.registers} />
              <MemoryGrid {...machine.memory} />
            </div>
            <BlockDiagram {...machine.diagram} />
            <TraceTable {...machine.trace} onScrub={actions.scrubTo} />
          </section>
        ) : null}
        {stage ? (
          <div className="submit-row">
            <button
              className="button button-secondary"
              disabled={!submission.canRunPublicTests}
              onClick={actions.runPublicTests}
              type="button"
            >
              运行公开测试
            </button>
            <button
              className="button button-primary"
              disabled={!submission.canSubmit}
              onClick={() => void actions.submit()}
              title={submission.title}
              type="button"
            >
              {submission.label}
            </button>
            <span className="submit-note">{submission.note}</span>
          </div>
        ) : null}
        <CpuTestPanel {...model.results} onReplayCounterexample={actions.replayCounterexample} />
      </main>
    </LabPageShell>
  );
}

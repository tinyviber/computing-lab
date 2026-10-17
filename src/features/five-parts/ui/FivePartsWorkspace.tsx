import type { ReactNode } from "react";
import { StageRail } from "../../../shared/lab/StageRail";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { Icon } from "../../../shared/ui/Icon";
import { FIVE_PARTS, type PartId } from "../domain/demo.ts";
import type {
  FivePartsLabActions,
  FivePartsLabViewModel,
  FivePartsPageViewModel,
  FivePartsWorkspaceProps,
  ObserveViewModel,
  PhoneViewModel,
  QuestionViewModel,
  StorageViewModel,
  ThinkViewModel,
} from "../controller/viewModel.ts";
import "./fiveParts.css";

/**
 * The five-parts workspace: four pages behind one page shell.
 * 1 walks the input→store→command→compute→output chain; 2 asks who commands
 * the arithmetic unit; 3 lets the student open/write/save/power-off an essay
 * to see memory vs storage; 4 maps one phone photo onto the five parts.
 * All teaching claims arrive through the view model — this file renders.
 */
export function FivePartsWorkspace({ model, actions }: FivePartsWorkspaceProps) {
  return (
    <LabPageShell
      collapsedLabel={model.pageLabel}
      labId="five-parts"
      rail={
        <StageRail
          label="计算机是怎么工作的？"
          onSelect={actions.selectStage}
          passedStages={model.rail.items.filter((i) => i.passed).map((i) => i.index)}
          stageIndex={model.stageIndex}
          stages={model.rail.items}
          unlocked={(stage) =>
            model.rail.items.find((i) => i.index === stage.index)?.unlocked ?? false
          }
        />
      }
      railWidth={220}
    >
      <main aria-label="五大部件实验区" className="fp-workspace">
        {model.feedback.message ? (
          <p className="test-error" role="alert">
            {model.feedback.message}
            <button onClick={actions.dismissMessage} type="button">
              <Icon name="x" size={12} />
            </button>
          </p>
        ) : null}
        {model.feedback.error ? (
          <p className="test-error" role="alert">
            {model.feedback.error}
          </p>
        ) : null}
        <Page actions={actions} model={model} page={model.page} />
      </main>
    </LabPageShell>
  );
}

type PageProps<P> = { page: P; model: FivePartsLabViewModel; actions: FivePartsLabActions };

function Page({ page, ...rest }: PageProps<FivePartsPageViewModel>) {
  switch (page.kind) {
    case "observe":
      return <ObservePage page={page} {...rest} />;
    case "think":
      return <ThinkPage page={page} {...rest} />;
    case "storage":
      return <StoragePage page={page} {...rest} />;
    case "phone":
      return <PhonePage page={page} {...rest} />;
  }
}

/** A diagram card; `active` = this step's highlight. */
function Card({
  title,
  role,
  active,
  className,
  children,
}: {
  title: string;
  role?: string;
  active: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`fp-part${className ? ` ${className}` : ""}${active ? " is-active" : ""}`}
    >
      <header>
        <strong>{title}</strong>
        {role ? <span className="fp-part-role">{role}</span> : null}
      </header>
      {children ? <div className="fp-part-body">{children}</div> : null}
    </section>
  );
}

/** One of the five parts from the add demo, titled and described by domain data. */
function PartCard({
  part,
  active,
  children,
}: {
  part: PartId;
  active: boolean;
  children?: ReactNode;
}) {
  const def = FIVE_PARTS.find((p) => p.id === part)!;
  return (
    <Card active={active} className={`fp-part-${part}`} role={def.role} title={def.title}>
      {children}
    </Card>
  );
}

/** Directional connector between two parts. */
function Arrow({ label }: { label?: string }) {
  return (
    <div aria-hidden="true" className="fp-arrow">
      <span className="fp-arrow-line" />
      {label ? <span className="fp-arrow-label">{label}</span> : null}
    </div>
  );
}

function Brief({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="fp-brief">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </header>
  );
}

function DemoNote() {
  return <p className="fp-note">这是一个概念演示，展示的是各部件的分工，不是真实的时序或线路。</p>;
}

function DigitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="fp-digit">
      <span className="fp-digit-label">{label}</span>
      <div className="fp-digit-controls">
        <button
          aria-label={`${label} 减一`}
          className="fp-digit-btn"
          onClick={() => onChange(-1)}
          type="button"
        >
          −
        </button>
        <output aria-label={`${label} 当前值`} className="fp-digit-value">
          {value}
        </output>
        <button
          aria-label={`${label} 加一`}
          className="fp-digit-btn"
          onClick={() => onChange(1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Caption + 执行下一步/重置 for the step-through pages; `extra` adds buttons. */
function StepControls({
  step,
  stepCount,
  caption,
  actions,
  extra,
}: {
  step: number;
  stepCount: number;
  caption: string;
  actions: FivePartsLabActions;
  extra?: ReactNode;
}) {
  const lastStep = step >= stepCount;
  return (
    <footer className="fp-controls">
      <p aria-live="polite" className="fp-step-caption">
        步骤 {step}/{stepCount} — {caption}
      </p>
      <div className="fp-actions">
        <button
          className="button button-primary"
          onClick={lastStep ? actions.resetDemo : actions.nextStep}
          type="button"
        >
          {lastStep ? "重新运行" : "执行下一步 →"}
        </button>
        <button
          className="button button-secondary"
          disabled={step === 0}
          onClick={actions.resetDemo}
          type="button"
        >
          重置
        </button>
        {extra}
      </div>
    </footer>
  );
}

/** The page's one server-judged question; feedback copy comes from the judge. */
function QuestionBlock({
  question,
  submitting,
  onPick,
}: {
  question: QuestionViewModel;
  submitting: boolean;
  onPick: (optionId: string) => void;
}) {
  return (
    <>
      <fieldset className="fp-question">
        <legend>{question.prompt}</legend>
        <ul className="fp-options">
          {question.options.map((option) => (
            <li key={option.id}>
              <button
                aria-pressed={question.selected === option.id}
                className={`fp-option${question.selected === option.id ? " is-selected" : ""}`}
                disabled={submitting}
                onClick={() => onPick(option.id)}
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      {question.verdict ? (
        <p
          className={`fp-verdict ${question.verdict.correct ? "is-correct" : "is-wrong"}`}
          role={question.verdict.correct ? "status" : "alert"}
        >
          {question.verdict.feedback}
        </p>
      ) : null}
    </>
  );
}

/** Back to the observe page, plus an optional, never-forced next page. */
function PageNav({ model, actions }: Omit<PageProps<unknown>, "page">) {
  return (
    <div className="fp-actions">
      <button
        className="button button-secondary"
        onClick={() => actions.selectStage(1)}
        type="button"
      >
        返回观察
      </button>
      {model.nextPage ? (
        <button
          className="button button-secondary"
          onClick={() => actions.selectStage(model.nextPage!.index)}
          type="button"
        >
          下一页：{model.nextPage.title} →
        </button>
      ) : null}
    </div>
  );
}

function ObservePage({ page, model, actions }: PageProps<ObserveViewModel>) {
  return (
    <section aria-label="让计算机把两个数字相加" className="fp-observe">
      <Brief eyebrow="第 1 页 · 观察" title="让计算机把两个数字相加">
        <p>修改输入的数字，观察计算机如何得到结果。</p>
        <DemoNote />
      </Brief>

      <div className="fp-diagram">
        <div className="fp-row">
          <PartCard active={page.highlight === "input"} part="input">
            <DigitInput
              label="数字 A"
              onChange={(delta) => actions.adjustInput("a", delta)}
              value={page.a}
            />
            <DigitInput
              label="数字 B"
              onChange={(delta) => actions.adjustInput("b", delta)}
              value={page.b}
            />
          </PartCard>
        </div>
        <Arrow />
        <div className="fp-row fp-row-middle">
          <PartCard active={page.highlight === "memory"} part="memory">
            {page.step >= 1 ? (
              <p className="fp-part-detail">
                已存入：{page.a} 和 {page.b}
              </p>
            ) : null}
          </PartCard>
          <PartCard active={page.highlight === "controller"} part="controller">
            {page.step >= 2 ? <p className="fp-part-detail">发出「做加法」的命令</p> : null}
          </PartCard>
        </div>
        <Arrow />
        <div className="fp-row">
          <PartCard active={page.highlight === "alu"} part="alu">
            {page.step >= 3 ? (
              <p className="fp-part-detail">
                {page.a} + {page.b} = {page.result}
              </p>
            ) : null}
          </PartCard>
        </div>
        <Arrow />
        <div className="fp-row">
          <PartCard active={page.highlight === "output"} part="output">
            <p className="fp-result" role="status">
              {page.step >= 4 ? page.result : "—"}
            </p>
          </PartCard>
        </div>
      </div>

      <StepControls
        actions={actions}
        caption={page.caption}
        extra={
          <button
            className="button button-primary"
            disabled={!page.demoComplete || model.submission.submitting}
            onClick={actions.continueToThink}
            title={page.continueBlocker ?? undefined}
            type="button"
          >
            继续：观察与思考
          </button>
        }
        step={page.step}
        stepCount={4}
      />
    </section>
  );
}

function ThinkPage({ page, model, actions }: PageProps<ThinkViewModel>) {
  return (
    <section aria-label="观察与思考" className="fp-think">
      <Brief eyebrow="第 2 页 · 思考" title="观察与思考">
        <p>
          上一页里，{page.a} + {page.b}
          {page.result !== null ? ` = ${page.result}` : ""} 是这样算出来的：输入 → 存储器 →
          控制器下令 → 运算器 → 输出。
        </p>
      </Brief>
      <QuestionBlock
        onPick={actions.pickAnswer}
        question={page.question}
        submitting={model.submission.submitting}
      />
      <PageNav actions={actions} model={model} />
    </section>
  );
}

const STORAGE_BUTTONS = [
  { op: "open", label: "打开文件" },
  { op: "write", label: "写一句" },
  { op: "save", label: "保存" },
  { op: "cpu-read", label: "让 CPU 数字数" },
  { op: "power-off", label: "断电" },
  { op: "power-on", label: "开机" },
] as const;

function EssayLines({ lines }: { lines: string[] }) {
  return (
    <ol className="fp-essay">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
  );
}

function StoragePage({ page, model, actions }: PageProps<StorageViewModel>) {
  return (
    <section aria-label="内存与外存：断电会怎样？" className="fp-storage">
      <Brief eyebrow="第 3 页 · 动手" title="内存与外存：断电会怎样？">
        <p>第 1 页的「存储器」分为内存和外存。打开一篇作文，写一句、保存、断电，看看两边的变化。</p>
        <DemoNote />
      </Brief>

      <div className="fp-diagram">
        <div className="fp-row">
          <Card active={page.highlight === "cpu"} role="从内存读取数据来处理" title="CPU">
            <p className="fp-part-detail">
              {page.cpu
                ? `数出：${page.cpu.sentences} 句，${page.cpu.chars} 个字`
                : "还没有读取数据"}
            </p>
          </Card>
        </div>
        <Arrow label="CPU 只和内存打交道" />
        <div className="fp-row fp-row-middle">
          <Card
            active={page.highlight === "memory"}
            className={page.powerOn ? undefined : "is-off"}
            role="手机里叫「运行内存」· 速度快 · 断电清空"
            title="内存"
          >
            {page.memory ? (
              <>
                <EssayLines lines={page.memory.lines} />
                {page.memory.unsaved ? <p className="fp-tag is-warn">有没保存的改动</p> : null}
              </>
            ) : (
              <p className="fp-empty">{page.powerOn ? "（空）" : "（已断电，空）"}</p>
            )}
          </Card>
          <Card
            active={page.highlight === "disk"}
            role="硬盘、U 盘、手机「存储空间」· 断电不丢"
            title="外存"
          >
            <p className="fp-file-name">作文.txt</p>
            <EssayLines lines={page.disk.lines} />
          </Card>
        </div>
      </div>

      <footer className="fp-controls">
        <p aria-live="polite" className="fp-step-caption">
          {page.powerOn ? "" : "⚡ 已断电 — "}
          {page.caption}
        </p>
        <div className="fp-actions">
          {STORAGE_BUTTONS.map(({ op, label }) => (
            <button
              className={`button button-secondary${op === "power-off" ? " fp-power-off" : ""}`}
              disabled={!page.enabled[op]}
              key={op}
              onClick={() => actions.storageOp(op)}
              type="button"
            >
              {label}
            </button>
          ))}
          <button
            className="button button-secondary"
            onClick={() => actions.storageOp("reset")}
            type="button"
          >
            重来
          </button>
        </div>
      </footer>

      <QuestionBlock
        onPick={actions.pickAnswer}
        question={page.question}
        submitting={model.submission.submitting}
      />
      <PageNav actions={actions} model={model} />
    </section>
  );
}

function PhonePage({ page, model, actions }: PageProps<PhoneViewModel>) {
  return (
    <section aria-label="手机里的五大部件" className="fp-phone">
      <Brief eyebrow="第 4 页 · 联系生活" title="手机里的五大部件">
        <p>手机也是一台计算机。一步一步拍一张照片，看每个部件在五大部件里扮演什么角色。</p>
        <DemoNote />
      </Brief>

      <ul className="fp-phone-grid">
        {page.parts.map((part) => (
          <li key={part.id}>
            <Card active={part.active} role={part.detail} title={part.title}>
              {part.tags.length > 0 ? (
                <p className="fp-tags">
                  {part.tags.map((tag) => (
                    <span className="fp-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </p>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      <StepControls
        actions={actions}
        caption={page.caption}
        step={page.step}
        stepCount={page.stepCount}
      />

      <QuestionBlock
        onPick={actions.pickAnswer}
        question={page.question}
        submitting={model.submission.submitting}
      />
      <PageNav actions={actions} model={model} />
    </section>
  );
}

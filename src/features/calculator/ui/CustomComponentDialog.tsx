import { useMemo, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { isValidComponentIdentifier, type ComponentSelection } from "../domain/componentize";
import type { ComponentDef } from "../domain/graph";

export type ComponentizeForm = {
  name: string;
  inputNames: string[];
  outputNames: string[];
  inputPortKeys: string[];
  outputPortKeys: string[];
};

type PortDraft = { key: string; name: string };
type PortKind = "input" | "output";

type CustomComponentDialogProps = {
  existingNames?: string[];
  selection?: ComponentSelection;
  component?: ComponentDef;
  onCancel: () => void;
  onCreate?: (form: ComponentizeForm) => void;
  onUpdate?: (form: ComponentizeForm) => void;
};

function firstAvailableName(existingNames: string[]): string {
  const names = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  let index = 1;
  while (names.has(`组合组件${index}`.toLocaleLowerCase())) index += 1;
  return `组合组件${index}`;
}

function nameError(value: string, existingNames: string[], kind: string): string | null {
  const name = value.trim();
  if (!isValidComponentIdentifier(name)) {
    return `${kind}只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。`;
  }
  if (existingNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return `名称“${name}”已存在。`;
  }
  return null;
}

function portNamesError(inputNames: string[], outputNames: string[]): string | null {
  const names = [...inputNames, ...outputNames].map((name) => name.trim());
  if (names.some((name) => !isValidComponentIdentifier(name))) {
    return "端口名称只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。";
  }
  if (new Set(names).size !== names.length) return "入口和出口名称不能重复。";
  return null;
}

function suggestedPortName(label: string, fallback: string): string {
  const candidate = label.split(" 的 ", 1)[0];
  return isValidComponentIdentifier(candidate) ? candidate : fallback;
}

/** Reinsert the dragged port at an index captured by the drop indicator. */
function reorderPorts(ports: PortDraft[], draggedKey: string, insertIndex: number): PortDraft[] {
  const fromIndex = ports.findIndex((port) => port.key === draggedKey);
  if (fromIndex < 0) return ports;
  const next = [...ports];
  const [moved] = next.splice(fromIndex, 1);
  const target = Math.min(
    Math.max(insertIndex - (insertIndex > fromIndex ? 1 : 0), 0),
    next.length,
  );
  next.splice(target, 0, moved);
  return next;
}

function DragGripIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 10 16" width="9">
      <circle cx="2.6" cy="3" r="1.4" />
      <circle cx="7.4" cy="3" r="1.4" />
      <circle cx="2.6" cy="8" r="1.4" />
      <circle cx="7.4" cy="8" r="1.4" />
      <circle cx="2.6" cy="13" r="1.4" />
      <circle cx="7.4" cy="13" r="1.4" />
    </svg>
  );
}

export function CustomComponentDialog({
  existingNames = [],
  selection,
  component,
  onCancel,
  onCreate,
  onUpdate,
}: CustomComponentDialogProps) {
  const isEditing = Boolean(component);
  const [name, setName] = useState(() => component?.name ?? firstAvailableName(existingNames));
  const [inputPorts, setInputPorts] = useState<PortDraft[]>(() =>
    component
      ? component.graph.nodes
          .filter((port) => port.kind === "input" && port.name)
          .map((port) => ({ key: port.id, name: port.name as string }))
      : (selection?.inputPorts ?? []).map((port) => ({
          key: port.key,
          name: suggestedPortName(port.externalLabel, port.defaultName),
        })),
  );
  const [outputPorts, setOutputPorts] = useState<PortDraft[]>(() =>
    component
      ? component.graph.nodes
          .filter((port) => port.kind === "output" && port.name)
          .map((port) => ({ key: port.id, name: port.name as string }))
      : (selection?.outputPorts ?? []).map((port) => ({
          key: port.key,
          name: suggestedPortName(port.externalLabels[0] ?? port.internalLabel, port.defaultName),
        })),
  );
  const [draggedPort, setDraggedPort] = useState<{ kind: PortKind; key: string } | null>(null);
  const [dropIndex, setDropIndex] = useState<{ kind: PortKind; index: number } | null>(null);
  const inputNames = inputPorts.map((port) => port.name);
  const outputNames = outputPorts.map((port) => port.name);

  const otherNames = useMemo(
    () =>
      existingNames.filter(
        (existing) => existing.toLocaleLowerCase() !== (component?.name ?? "").toLocaleLowerCase(),
      ),
    [component?.name, existingNames],
  );
  const componentNameError = useMemo(
    () => nameError(name, otherNames, "组件名称"),
    [otherNames, name],
  );
  const portsError = useMemo(
    () => portNamesError(inputNames, outputNames),
    [inputNames, outputNames],
  );
  const error = selection?.error ?? componentNameError ?? portsError;

  const updateName = (
    setPorts: Dispatch<SetStateAction<PortDraft[]>>,
    key: string,
    value: string,
  ) => {
    setPorts((current) =>
      current.map((port) => (port.key === key ? { ...port, name: value } : port)),
    );
  };

  const clearDrag = () => {
    setDraggedPort(null);
    setDropIndex(null);
  };

  const onPortDragStart = (event: DragEvent, kind: PortKind, key: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDraggedPort({ kind, key });
  };

  /**
   * One dragover listener per list: the insertion index comes from comparing
   * the pointer against each row's midpoint, so hovering gaps still resolves
   * to the nearest slot and the indicator can render between rows.
   */
  const onListDragOver = (event: DragEvent, kind: PortKind, count: number) => {
    if (draggedPort?.kind !== kind) return;
    event.preventDefault();
    const rows = event.currentTarget.querySelectorAll("[data-port-key]");
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : 0;
    let index = count;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (pointerY <= rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropIndex({ kind, index });
  };

  const onPortDrop = (event: DragEvent, kind: PortKind, fallbackIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedPort?.kind === kind) {
      const index = dropIndex?.kind === kind ? dropIndex.index : fallbackIndex;
      const setter = kind === "input" ? setInputPorts : setOutputPorts;
      setter((current) => reorderPorts(current, draggedPort.key, index));
    }
    clearDrag();
  };

  const onListDragLeave = (event: DragEvent, kind: PortKind) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropIndex((current) => (current?.kind === kind ? null : current));
    }
  };

  const dropClass = (kind: PortKind, index: number, count: number): string => {
    if (dropIndex?.kind !== kind) return "";
    if (dropIndex.index === index) return " drop-before";
    if (dropIndex.index >= count && index === count - 1) return " drop-after";
    return "";
  };

  return (
    <div
      aria-label={isEditing ? "编辑自定义组件" : "创建自定义组件"}
      className="custom-component-scrim"
      onClick={onCancel}
      role="presentation"
    >
      <section
        aria-labelledby="custom-component-title"
        aria-modal="true"
        className="custom-component-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="custom-component-dialog-heading">
          <div>
            <p className="eyebrow">组件封装 / COMPONENT</p>
            <h2 id="custom-component-title">
              {isEditing ? "编辑自定义组件" : "把框选部分变成组件"}
            </h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onCancel} type="button">
            <Icon name="x" size={15} />
          </button>
        </div>
        <p className="custom-component-dialog-note">
          {isEditing
            ? "拖动端口左侧的手柄可调整输入、输出顺序；修改名称会同步更新组件的连线引用。"
            : "选区内的元件会移入黑盒；跨出选区的连线会自动变成入口或出口。拖动端口左侧的手柄可调整顺序，连线关系会随端口一起移动。"}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (error) return;
            const form = {
              name: name.trim(),
              inputNames: inputPorts.map((port) => port.name.trim()),
              outputNames: outputPorts.map((port) => port.name.trim()),
              inputPortKeys: inputPorts.map((port) => port.key),
              outputPortKeys: outputPorts.map((port) => port.key),
            };
            if (isEditing) onUpdate?.(form);
            else onCreate?.(form);
          }}
        >
          <label className="custom-component-field">
            <span>组件名称</span>
            <input
              autoFocus={!isEditing}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>

          <div className="custom-component-port-groups">
            <fieldset
              onDragLeave={(event) => onListDragLeave(event, "input")}
              onDragOver={(event) => onListDragOver(event, "input", inputPorts.length)}
              onDrop={(event) => onPortDrop(event, "input", inputPorts.length)}
            >
              <legend>入口（{inputPorts.length}）</legend>
              {inputPorts.length === 0 ? (
                <p className="custom-component-no-ports">无入口</p>
              ) : (
                inputPorts.map((port, index) => (
                  <div
                    className={`custom-component-port-row${
                      draggedPort?.kind === "input" && draggedPort.key === port.key
                        ? " is-drag-source"
                        : ""
                    }${dropClass("input", index, inputPorts.length)}`}
                    data-port-key={port.key}
                    key={port.key}
                    onDrop={(event) => onPortDrop(event, "input", index)}
                  >
                    <span
                      aria-label={`拖动入口 ${index + 1}`}
                      className="custom-component-port-drag-handle"
                      draggable
                      onDragEnd={clearDrag}
                      onDragStart={(event) => onPortDragStart(event, "input", port.key)}
                      title="拖动调整顺序"
                    >
                      <DragGripIcon />
                    </span>
                    <input
                      aria-label={`入口 ${index + 1} 名称`}
                      onChange={(event) => updateName(setInputPorts, port.key, event.target.value)}
                      value={port.name}
                    />
                  </div>
                ))
              )}
            </fieldset>
            <fieldset
              onDragLeave={(event) => onListDragLeave(event, "output")}
              onDragOver={(event) => onListDragOver(event, "output", outputPorts.length)}
              onDrop={(event) => onPortDrop(event, "output", outputPorts.length)}
            >
              <legend>出口（{outputPorts.length}）</legend>
              {outputPorts.length === 0 ? (
                <p className="custom-component-no-ports">无出口</p>
              ) : (
                outputPorts.map((port, index) => (
                  <div
                    className={`custom-component-port-row${
                      draggedPort?.kind === "output" && draggedPort.key === port.key
                        ? " is-drag-source"
                        : ""
                    }${dropClass("output", index, outputPorts.length)}`}
                    data-port-key={port.key}
                    key={port.key}
                    onDrop={(event) => onPortDrop(event, "output", index)}
                  >
                    <span
                      aria-label={`拖动出口 ${index + 1}`}
                      className="custom-component-port-drag-handle"
                      draggable
                      onDragEnd={clearDrag}
                      onDragStart={(event) => onPortDragStart(event, "output", port.key)}
                      title="拖动调整顺序"
                    >
                      <DragGripIcon />
                    </span>
                    <input
                      aria-label={`出口 ${index + 1} 名称`}
                      onChange={(event) => updateName(setOutputPorts, port.key, event.target.value)}
                      value={port.name}
                    />
                  </div>
                ))
              )}
            </fieldset>
          </div>

          <section aria-label="端口对应关系" className="custom-component-mappings">
            <div>
              <p className="custom-component-mappings-title">
                {isEditing ? "当前端口顺序" : "端口对应关系"}
              </p>
              <p className="custom-component-mappings-note">
                {isEditing
                  ? "保存后，组件实例会按新顺序显示；已有连线会继续连接到对应端口。"
                  : "封装后，入口和出口会按顺序连接原电路；名称修改只会改变黑盒外部端口名。"}
              </p>
            </div>
            {isEditing ? (
              <p className="custom-component-no-ports">拖动上方手柄即可调整端口顺序。</p>
            ) : inputNames.length > 0 || outputNames.length > 0 ? (
              <>
                <div aria-label="端口摘要" className="custom-component-mapping-summary">
                  {inputPorts.map((port, index) => (
                    <div
                      className="custom-component-mapping-summary-row"
                      key={`input-summary-${port.key}`}
                    >
                      <strong>{port.name || "（未命名）"}</strong>
                      <span>→ 输入 {index + 1}</span>
                    </div>
                  ))}
                  {outputPorts.map((port, index) => (
                    <div
                      className="custom-component-mapping-summary-row"
                      key={`output-summary-${port.key}`}
                    >
                      <strong>{port.name || "（未命名）"}</strong>
                      <span>→ 输出 {index + 1}</span>
                    </div>
                  ))}
                </div>
                <details className="custom-component-mapping-details">
                  <summary>查看详细端口对应关系</summary>
                  <div className="custom-component-mapping-details-content">
                    {inputPorts.map((port, index) => {
                      const boundary = selection?.inputPorts.find(
                        (candidate) => candidate.key === port.key,
                      );
                      if (!boundary) return null;
                      return (
                        <div className="custom-component-mapping" key={`input-mapping-${port.key}`}>
                          <code>I{index}</code>
                          <span className="custom-component-mapping-name">
                            当前名：{port.name || "（未命名）"}
                          </span>
                          <span>
                            ← {boundary.externalLabel} → {boundary.internalLabels.join("、")}
                          </span>
                        </div>
                      );
                    })}
                    {outputPorts.map((port, index) => {
                      const boundary = selection?.outputPorts.find(
                        (candidate) => candidate.key === port.key,
                      );
                      if (!boundary) return null;
                      return (
                        <div
                          className="custom-component-mapping"
                          key={`output-mapping-${port.key}`}
                        >
                          <code>O{index}</code>
                          <span className="custom-component-mapping-name">
                            当前名：{port.name || "（未命名）"}
                          </span>
                          <span>
                            ← {boundary.internalLabel} → {boundary.externalLabels.join("、")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </>
            ) : (
              <p className="custom-component-no-ports">没有跨出选区的端口。</p>
            )}
          </section>

          {selection ? (
            <p className="custom-component-selection-summary">
              已框选 {selection.selectedIds.length} 个元件 · 将生成 {inputPorts.length} 个入口、
              {outputPorts.length} 个出口
            </p>
          ) : null}
          {error ? (
            <p className="test-error custom-component-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="custom-component-actions">
            <button className="button button-ghost" onClick={onCancel} type="button">
              取消
            </button>
            <button className="button button-primary" disabled={Boolean(error)} type="submit">
              {isEditing ? "保存修改" : "封装并替换"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

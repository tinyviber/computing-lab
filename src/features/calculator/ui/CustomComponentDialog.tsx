import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { isValidComponentIdentifier, type ComponentSelection } from "../domain/componentize";

export type ComponentizeForm = {
  name: string;
  inputNames: string[];
  outputNames: string[];
};

type CustomComponentDialogProps = {
  existingNames: string[];
  selection: ComponentSelection;
  onCancel: () => void;
  onCreate: (form: ComponentizeForm) => void;
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

export function CustomComponentDialog({
  existingNames,
  selection,
  onCancel,
  onCreate,
}: CustomComponentDialogProps) {
  const [name, setName] = useState(() => firstAvailableName(existingNames));
  const [inputNames, setInputNames] = useState(() =>
    selection.inputPorts.map((port) => suggestedPortName(port.externalLabel, port.defaultName)),
  );
  const [outputNames, setOutputNames] = useState(() =>
    selection.outputPorts.map((port) =>
      suggestedPortName(port.externalLabels[0] ?? port.internalLabel, port.defaultName),
    ),
  );

  const componentNameError = useMemo(
    () => nameError(name, existingNames, "组件名称"),
    [existingNames, name],
  );
  const portsError = useMemo(
    () => portNamesError(inputNames, outputNames),
    [inputNames, outputNames],
  );
  const error = selection.error ?? componentNameError ?? portsError;

  const updateName = (
    setNames: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string,
  ) => {
    setNames((current) =>
      current.map((nameValue, nameIndex) => (nameIndex === index ? value : nameValue)),
    );
  };

  return (
    <div
      aria-label="创建自定义组件"
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
            <h2 id="custom-component-title">把框选部分变成组件</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onCancel} type="button">
            ×
          </button>
        </div>
        <p className="custom-component-dialog-note">
          选区内的元件会移入黑盒；跨出选区的连线会自动变成入口或出口，数量完全由选区决定。
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (error) return;
            onCreate({
              name: name.trim(),
              inputNames: inputNames.map((port) => port.trim()),
              outputNames: outputNames.map((port) => port.trim()),
            });
          }}
        >
          <label className="custom-component-field">
            <span>组件名称</span>
            <input autoFocus onChange={(event) => setName(event.target.value)} value={name} />
          </label>

          <div className="custom-component-port-groups">
            <fieldset>
              <legend>入口（{inputNames.length}）</legend>
              {inputNames.length === 0 ? (
                <p className="custom-component-no-ports">无入口</p>
              ) : (
                inputNames.map((port, index) => (
                  <label className="custom-component-port-field" key={`input-${index}`}>
                    <span>入口 {index + 1}</span>
                    <input
                      aria-label={`入口 ${index + 1} 名称`}
                      onChange={(event) => updateName(setInputNames, index, event.target.value)}
                      value={port}
                    />
                  </label>
                ))
              )}
            </fieldset>
            <fieldset>
              <legend>出口（{outputNames.length}）</legend>
              {outputNames.length === 0 ? (
                <p className="custom-component-no-ports">无出口</p>
              ) : (
                outputNames.map((port, index) => (
                  <label className="custom-component-port-field" key={`output-${index}`}>
                    <span>出口 {index + 1}</span>
                    <input
                      aria-label={`出口 ${index + 1} 名称`}
                      onChange={(event) => updateName(setOutputNames, index, event.target.value)}
                      value={port}
                    />
                  </label>
                ))
              )}
            </fieldset>
          </div>

          <section aria-label="端口对应关系" className="custom-component-mappings">
            <div>
              <p className="custom-component-mappings-title">端口对应关系</p>
              <p className="custom-component-mappings-note">
                封装后，入口和出口会按顺序连接原电路；名称修改只会改变黑盒外部端口名。
              </p>
            </div>
            {inputNames.length > 0 || outputNames.length > 0 ? (
              <>
                <div aria-label="端口摘要" className="custom-component-mapping-summary">
                  {inputNames.map((port, index) => (
                    <div
                      className="custom-component-mapping-summary-row"
                      key={`input-summary-${index}`}
                    >
                      <strong>{port || "（未命名）"}</strong>
                      <span>→ 输入 {index + 1}</span>
                    </div>
                  ))}
                  {outputNames.map((port, index) => (
                    <div
                      className="custom-component-mapping-summary-row"
                      key={`output-summary-${index}`}
                    >
                      <strong>{port || "（未命名）"}</strong>
                      <span>→ 输出 {index + 1}</span>
                    </div>
                  ))}
                </div>
                <details className="custom-component-mapping-details">
                  <summary>查看详细端口对应关系</summary>
                  <div className="custom-component-mapping-details-content">
                    {inputNames.map((port, index) => {
                      const boundary = selection.inputPorts[index];
                      return (
                        <div className="custom-component-mapping" key={`input-mapping-${index}`}>
                          <code>I{index}</code>
                          <span className="custom-component-mapping-name">
                            当前名：{port || "（未命名）"}
                          </span>
                          <span>
                            ← {boundary.externalLabel} → {boundary.internalLabels.join("、")}
                          </span>
                        </div>
                      );
                    })}
                    {outputNames.map((port, index) => {
                      const boundary = selection.outputPorts[index];
                      return (
                        <div className="custom-component-mapping" key={`output-mapping-${index}`}>
                          <code>O{index}</code>
                          <span className="custom-component-mapping-name">
                            当前名：{port || "（未命名）"}
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

          <p className="custom-component-selection-summary">
            已框选 {selection.selectedIds.length} 个元件 · 将生成 {inputNames.length} 个入口、
            {outputNames.length} 个出口
          </p>
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
              封装并替换
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

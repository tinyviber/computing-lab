import { Link } from "@tanstack/react-router";
import { basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import "./editor.css";

type LessonFile = {
  path: string;
  size: number;
  editable: boolean;
};

type Lesson = {
  slug: string;
  title: string;
  files: LessonFile[];
};

type PreviewState = "idle" | "starting" | "ready" | "error" | "stopped";

type ApiError = Error & { status?: number };

const appBase = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function appUrl(path: string): string {
  return `${appBase}${path}` || "/";
}

function apiFileUrl(slug: string, path: string): string {
  return appUrl(
    `/api/editor/lessons/${encodeURIComponent(slug)}/files/${encodeURIComponent(path)}`,
  );
}

async function responseError(response: Response): Promise<ApiError> {
  let message = `请求失败（${response.status}）`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    // Keep the status-based message when the server did not return JSON.
  }
  const error = new Error(message) as ApiError;
  error.status = response.status;
  return error;
}

function preferredFile(lesson: Lesson | undefined): string {
  if (!lesson) return "";
  return (
    lesson.files.find((file) => file.path === "slides.md" && file.editable)?.path ??
    lesson.files.find((file) => file.editable)?.path ??
    ""
  );
}

function languageForFile(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "md") return markdown();
  if (extension === "css") return css();
  if (extension === "html" || extension === "vue") return html();
  if (extension === "json") return javascript({ json: true });
  return javascript({
    jsx: extension === "tsx",
    typescript: extension === "ts" || extension === "tsx",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SourceEditorProps = {
  filePath: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
};

function SourceEditor({ filePath, value, onChange, onSave }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        languageForFile(filePath),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              onSaveRef.current();
              return true;
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return <div className="editor-codemirror" ref={hostRef} />;
}

function LoginPanel({ onLogin }: { onLogin: (password: string) => Promise<string | null> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await onLogin(password);
    if (message) setError(message);
    else setPassword("");
    setSubmitting(false);
  };

  return (
    <main className="editor-login-page">
      <form className="editor-login-card" onSubmit={submit}>
        <Link className="editor-login-back" to="/">
          ← 返回计算实验室
        </Link>
        <p className="editor-kicker">COMPUTING LAB / EDITOR</p>
        <h1>在线课件编辑</h1>
        <p className="editor-login-copy">
          这里会直接修改服务器上的 Markdown、Vue 组件和样式文件，并通过 Slidev 实时预览。
        </p>
        <label className="editor-field-label" htmlFor="editor-password">
          编辑密码
        </label>
        <input
          autoFocus
          className="editor-password-input"
          id="editor-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入密码"
          type="password"
          value={password}
        />
        {error ? <p className="editor-form-error">{error}</p> : null}
        <button
          className="button button-primary editor-login-submit"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "验证中…" : "进入编辑器"}
        </button>
      </form>
    </main>
  );
}

export function EditorPage() {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveMessage, setSaveMessage] = useState("尚未加载课件");
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewOutput, setPreviewOutput] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.slug === selectedSlug),
    [lessons, selectedSlug],
  );
  const editableFiles = useMemo(
    () => selectedLesson?.files.filter((file) => file.editable) ?? [],
    [selectedLesson],
  );
  const dirty = content !== savedContent;
  const handleContentChange = useCallback(
    (nextContent: string) => {
      setContent(nextContent);
      const returnedToSavedVersion = nextContent === savedContent;
      setSaveState(returnedToSavedVersion ? "saved" : "dirty");
      setSaveMessage(returnedToSavedVersion ? "已恢复到已保存版本" : "有未保存修改");
    },
    [savedContent],
  );

  const requireLogin = useCallback(() => {
    setAuthenticated(false);
    setAuthRequired(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(appUrl("/api/editor/session"))
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) {
            setAuthRequired(true);
            setAuthenticated(false);
          }
          return;
        }
        if (!response.ok) throw await responseError(response);
        if (!cancelled) {
          setAuthRequired(false);
          setAuthenticated(true);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setPageError(`编辑服务不可用：${error.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string): Promise<string | null> => {
    try {
      const response = await fetch(appUrl("/api/editor/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) return (await responseError(response)).message;
      setAuthRequired(false);
      setAuthenticated(true);
      return null;
    } catch (error) {
      return `登录失败：${(error as Error).message}`;
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setPageError(null);
    fetch(appUrl("/api/editor/lessons"))
      .then(async (response) => {
        if (response.status === 401) {
          requireLogin();
          return;
        }
        if (!response.ok) throw await responseError(response);
        const payload = (await response.json()) as { lessons: Lesson[] };
        if (!cancelled) setLessons(payload.lessons);
      })
      .catch((error: Error) => {
        if (!cancelled) setPageError(`读取课件目录失败：${error.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, requireLogin]);

  useEffect(() => {
    if (!lessons.length) return;
    const lesson = lessons.find((item) => item.slug === selectedSlug) ?? lessons[0];
    if (lesson.slug !== selectedSlug) {
      setSelectedSlug(lesson.slug);
      setSelectedPath(preferredFile(lesson));
      return;
    }
    if (!editableFiles.some((file) => file.path === selectedPath)) {
      setSelectedPath(preferredFile(lesson));
    }
  }, [editableFiles, lessons, selectedPath, selectedSlug]);

  useEffect(() => {
    if (!authenticated || !selectedSlug || !selectedPath) return;
    let cancelled = false;
    setLoadingFile(true);
    setSaveState("saved");
    setSaveMessage("读取中…");
    fetch(apiFileUrl(selectedSlug, selectedPath))
      .then(async (response) => {
        if (response.status === 401) {
          requireLogin();
          return;
        }
        if (!response.ok) throw await responseError(response);
        const payload = (await response.json()) as { content: string };
        if (!cancelled) {
          setContent(payload.content);
          setSavedContent(payload.content);
          setSaveMessage("已从服务器读取");
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setContent("");
          setSavedContent("");
          setSaveState("error");
          setSaveMessage(`读取失败：${error.message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, requireLogin, selectedPath, selectedSlug]);

  const saveFile = useCallback(async () => {
    if (!selectedSlug || !selectedPath || loadingFile || !dirty) return;
    setSaveState("saving");
    setSaveMessage("保存中…");
    try {
      const response = await fetch(apiFileUrl(selectedSlug, selectedPath), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (response.status === 401) {
        requireLogin();
        return;
      }
      if (!response.ok) throw await responseError(response);
      setSavedContent(content);
      setSaveState("saved");
      setSaveMessage(
        `已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (error) {
      setSaveState("error");
      setSaveMessage(`保存失败：${(error as Error).message}`);
    }
  }, [content, dirty, loadingFile, requireLogin, selectedPath, selectedSlug]);

  useEffect(() => {
    if (!authenticated || !selectedSlug) return;
    let cancelled = false;
    const checkPreview = async () => {
      try {
        const response = await fetch(
          appUrl(`/api/editor/lessons/${encodeURIComponent(selectedSlug)}/preview-status`),
        );
        if (response.status === 401) {
          requireLogin();
          return;
        }
        if (!response.ok) throw await responseError(response);
        const payload = (await response.json()) as {
          state: PreviewState;
          output?: string;
        };
        if (!cancelled) {
          setPreviewState(payload.state);
          setPreviewOutput(payload.output ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewState("error");
          setPreviewOutput((error as Error).message);
        }
      }
    };
    setPreviewState("starting");
    void checkPreview();
    const timer = window.setInterval(() => void checkPreview(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticated, requireLogin, selectedSlug]);

  const chooseLesson = (slug: string) => {
    if (dirty && !window.confirm("当前文件有未保存修改，切换课件会丢失这些修改。继续吗？")) return;
    const lesson = lessons.find((item) => item.slug === slug);
    setSelectedSlug(slug);
    setSelectedPath(preferredFile(lesson));
    setContent("");
    setSavedContent("");
  };

  const chooseFile = (path: string) => {
    if (path === selectedPath) return;
    if (dirty && !window.confirm("当前文件有未保存修改，切换文件会丢失这些修改。继续吗？")) return;
    setSelectedPath(path);
    setContent("");
    setSavedContent("");
  };

  const logout = async () => {
    await fetch(appUrl("/api/editor/logout"), { method: "POST" });
    setAuthenticated(false);
    setAuthRequired(true);
  };

  if (pageError) {
    return (
      <main className="editor-login-page">
        <section className="editor-login-card">
          <Link className="editor-login-back" to="/">
            ← 返回计算实验室
          </Link>
          <p className="editor-kicker">COMPUTING LAB / EDITOR</p>
          <h1>编辑服务未启动</h1>
          <p className="editor-login-copy">{pageError}</p>
          <p className="editor-start-hint">
            本地开发请运行 <code>bun run editor:dev</code>，服务器请运行{" "}
            <code>bun run editor:start</code>。
          </p>
        </section>
      </main>
    );
  }

  if (authRequired === null || !authenticated) {
    return authRequired ? (
      <LoginPanel onLogin={login} />
    ) : (
      <div className="editor-loading">连接编辑服务…</div>
    );
  }

  const previewUrl = selectedSlug ? appUrl(`/__preview/${encodeURIComponent(selectedSlug)}/`) : "";
  const previewLabel =
    previewState === "ready"
      ? "实时预览已连接"
      : previewState === "starting"
        ? "正在启动 Slidev…"
        : previewState === "error"
          ? "预览启动失败"
          : "等待预览";

  return (
    <div className="editor-page">
      <header className="editor-topbar">
        <div className="editor-heading">
          <Link className="editor-back" to="/">
            ← 计算实验室
          </Link>
          <span className="editor-heading-divider" aria-hidden="true" />
          <div>
            <p className="editor-kicker">ONLINE AUTHORING</p>
            <h1>课件编辑器</h1>
          </div>
        </div>
        <div className="editor-toolbar">
          <label className="editor-lesson-select-label" htmlFor="lesson-select">
            当前课件
          </label>
          <select
            className="editor-lesson-select"
            id="lesson-select"
            onChange={(event) => chooseLesson(event.target.value)}
            value={selectedSlug}
          >
            {lessons.map((lesson) => (
              <option key={lesson.slug} value={lesson.slug}>
                {lesson.title}
              </option>
            ))}
          </select>
          <button
            className="button button-secondary editor-toolbar-button"
            onClick={() => void saveFile()}
            disabled={!dirty || saveState === "saving"}
            type="button"
          >
            {saveState === "saving" ? "保存中…" : "保存"}
          </button>
          <button className="editor-logout" onClick={() => void logout()} type="button">
            退出
          </button>
        </div>
      </header>

      <main className="editor-workspace">
        <aside className="editor-file-panel" aria-label="课件文件">
          <div className="editor-panel-heading">
            <div>
              <p className="editor-panel-kicker">SOURCE FILES</p>
              <h2>课件文件</h2>
            </div>
            <span className="editor-file-count">{editableFiles.length}</span>
          </div>
          <p className="editor-panel-copy">修改后点击保存，右侧 Slidev 会自动更新。</p>
          <div className="editor-file-list">
            {selectedLesson?.files.map((file) => (
              <button
                className={`editor-file-item ${file.path === selectedPath ? "is-selected" : ""}`}
                disabled={!file.editable}
                key={file.path}
                onClick={() => chooseFile(file.path)}
                title={file.editable ? file.path : "图片等素材当前只读"}
                type="button"
              >
                <span className="editor-file-name">{file.path}</span>
                <span className="editor-file-meta">
                  {file.editable ? formatBytes(file.size) : "只读素材"}
                </span>
              </button>
            ))}
          </div>
          <div className="editor-file-note">
            <span className="editor-note-dot" />
            当前保存的是服务器文件
          </div>
        </aside>

        <section className="editor-source-panel" aria-label="源码编辑区">
          <div className="editor-panel-heading editor-source-heading">
            <div>
              <p className="editor-panel-kicker">MARKDOWN + CODE</p>
              <h2>{selectedPath || "选择一个可编辑文件"}</h2>
            </div>
            <div className={`editor-save-status is-${saveState}`}>
              <span className="editor-status-dot" />
              {saveMessage}
            </div>
          </div>
          <div className="editor-code-wrap">
            {loadingFile || !selectedPath ? (
              <div className="editor-empty-state">
                {selectedPath ? "读取文件…" : "左侧选择一个源文件"}
              </div>
            ) : (
              <SourceEditor
                filePath={selectedPath}
                onChange={handleContentChange}
                onSave={() => void saveFile()}
                value={content}
              />
            )}
          </div>
          <div className="editor-source-footer">
            <span>{dirty ? "有未保存修改" : "已保存"}</span>
            <span>Ctrl / ⌘ + S 保存</span>
          </div>
        </section>

        <section className="editor-preview-panel" aria-label="Slidev 实时预览">
          <div className="editor-panel-heading editor-preview-heading">
            <div>
              <p className="editor-panel-kicker">LIVE PREVIEW</p>
              <h2>Slidev 预览</h2>
            </div>
            <div className={`editor-preview-status is-${previewState}`}>
              <span className="editor-status-dot" />
              {previewLabel}
            </div>
            <button
              aria-label="刷新预览"
              className="editor-refresh-button"
              onClick={() => setPreviewVersion((version) => version + 1)}
              title="刷新预览"
              type="button"
            >
              ↻
            </button>
          </div>
          <div className="editor-preview-wrap">
            {previewState === "error" ? (
              <div className="editor-preview-error">
                <strong>Slidev 没有正常启动</strong>
                <pre>{previewOutput || "请检查服务器依赖和课件源码。"}</pre>
              </div>
            ) : previewState === "ready" && previewUrl ? (
              <iframe
                className="editor-preview-frame"
                key={`${previewUrl}-${previewVersion}`}
                src={previewUrl}
                title="Slidev 课件实时预览"
              />
            ) : (
              <div className="editor-empty-state">
                {previewState === "starting" ? "正在启动 Slidev…" : "选择课件后启动预览"}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

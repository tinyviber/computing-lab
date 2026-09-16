/**
 * Thin fetch wrapper for the lab API. Cookies carry the session, so every
 * request is `credentials: "same-origin"`; failures surface as ApiError with
 * the server's machine-readable code.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const API_ERROR_MESSAGES: Record<string, string> = {
  "invite-code-not-found": "邀请码不存在，请向老师确认。",
  "invalid-credentials": "学号或密码不正确。",
  "wrong-password": "该学号已注册，密码不正确。",
  "invalid-student-no": "学号只能包含字母、数字、下划线或连字符。",
  "invalid-name": "请填写姓名。",
  "weak-password": "密码至少 4 位。",
  unauthenticated: "请先登录。",
  "not-a-member": "你不在这个班级里。",
  "teacher-required": "只有教师可以查看看板。",
  "stage-locked": "这一关还没有解锁。",
  "invalid-stage": "关卡编号无效。",
  "internal-error": "服务器出错了，请稍后再试。",
  offline: "网络连接失败，请检查网络。",
};

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return API_ERROR_MESSAGES[error.code] ?? `请求失败（${error.code}）。`;
  }
  return API_ERROR_MESSAGES.offline;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "internal-error";
    throw new ApiError(response.status, code);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
};

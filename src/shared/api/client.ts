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
  "invalid-credentials": "学号或密码不正确。",
  "invalid-student-no": "学号只能包含字母、数字、下划线或连字符。",
  "invalid-name": "请填写姓名。",
  "weak-password": "密码至少 4 位。",
  "current-password-incorrect": "当前密码不正确。",
  "same-password": "新密码不能与当前密码相同。",
  unauthenticated: "请先登录。",
  "not-a-member": "你不在这个班级里。",
  "teacher-required": "只有教师或管理员可以访问。",
  "admin-required": "需要管理员权限。",
  "student-no-taken": "该学号已被占用。",
  "class-not-found": "班级不存在，请检查班级或邀请码。",
  "invalid-role": "角色无效（可选：admin / teacher / user）。",
  "invalid-row": "该行格式不正确。",
  "invalid-import": "导入内容为空或格式不正确。",
  "invalid-invite-code": "邀请码只能包含字母、数字、下划线或连字符。",
  "invite-code-taken": "该邀请码已被使用。",
  "admin-role-not-editable": "不能把角色设置为管理员。",
  "cannot-edit-own-role": "不能修改自己的角色。",
  "cannot-edit-own-password": "请在个人设置里修改自己的密码。",
  "cannot-delete-self": "不能删除自己的账号。",
  "already-member": "该用户已在这个班级里。",
  "user-not-found": "账号不存在。",
  "class-not-empty": "班级里还有成员，请先移除全部成员。",
  "membership-not-found": "该用户不在这个班级里。",
  "stage-locked": "这一关还没有解锁。",
  "invalid-stage": "关卡编号无效。",
  "unknown-stage": "关卡不存在。",
  "invalid-resolution": "分辨率无效（宽和高需在 2～64 之间）。",
  "square-resolution-required": "这一关要求正方形分辨率（宽 = 高）。",
  "tall-resolution-required": "这一关要求高度大于宽度（高 > 宽）。",
  "lab-not-available": "这个实验暂未开放。",
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
  del: <T>(path: string) => request<T>("DELETE", path),
};

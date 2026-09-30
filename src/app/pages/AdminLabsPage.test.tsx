import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminAuthState, renderAppAt } from "../../test/router-test-helpers";

const labs = [
  {
    id: "calculator",
    stageCount: 7,
    hidden: false,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
  {
    id: "cpu",
    stageCount: 5,
    hidden: true,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
];
const classes = [
  { id: "c1", name: "一班", inviteCode: "C1", memberCount: 0 },
  { id: "c2", name: "二班", inviteCode: "C2", memberCount: 0 },
];

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "PUT") return jsonResponse({ lab: {} });
    if (path.includes("/api/admin/classes")) return jsonResponse({ classes });
    if (path.includes("/api/labs")) return jsonResponse({ labs });
    return jsonResponse({});
  });
}

function labRow(title: string) {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`row for ${title} not found`);
  return within(row);
}

describe("AdminLabsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scopes an open lab to the checked classes and saves", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "实验管理" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("实现ALU")).toBeInTheDocument());
    const calc = labRow("实现ALU");
    // openClassIds null → every class box checked, nothing to save yet.
    await waitFor(() => expect(calc.getByRole("radio", { name: "开放" })).toBeChecked());
    expect(calc.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(calc.getByRole("checkbox", { name: "二班" })).toBeChecked();
    expect(calc.getByText("全部班级")).toBeInTheDocument();

    // Uncheck one class → the row becomes dirty and stores the pinned subset.
    await user.click(calc.getByRole("checkbox", { name: "二班" }));
    expect(calc.getByText("1 个班")).toBeInTheDocument();
    await user.click(calc.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/calculator/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: false, openClassIds: ["c1"] }),
        }),
      ),
    );
  });

  it("supports 全选 / 取消全部 and hides a lab for admins only", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    await waitFor(() => expect(screen.getByText("冯诺依曼数据通路")).toBeInTheDocument());
    const cpu = labRow("冯诺依曼数据通路");
    await waitFor(() => expect(cpu.getByRole("radio", { name: /隐藏/ })).toBeChecked());
    expect(cpu.queryByRole("checkbox")).not.toBeInTheDocument();

    // Switch to 开放, clear every class → stores an empty scope.
    await user.click(cpu.getByRole("radio", { name: "开放" }));
    await user.click(cpu.getByRole("button", { name: "取消全部" }));
    expect(cpu.getByRole("checkbox", { name: "一班" })).not.toBeChecked();
    expect(cpu.getByText("0 个班")).toBeInTheDocument();
    await user.click(cpu.getByRole("button", { name: "全选" }));
    expect(cpu.getByRole("checkbox", { name: "一班" })).toBeChecked();
    await user.click(cpu.getByRole("button", { name: "取消全部" }));

    await user.click(cpu.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/cpu/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: false, openClassIds: [] }),
        }),
      ),
    );

    // Picking 隐藏 sends the hidden flag with the scope left as "all".
    const calc = labRow("实现ALU");
    await user.click(calc.getByRole("radio", { name: /隐藏/ }));
    await user.click(calc.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/calculator/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: true, openClassIds: null }),
        }),
      ),
    );
  });
});

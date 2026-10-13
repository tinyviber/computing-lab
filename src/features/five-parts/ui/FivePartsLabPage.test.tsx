import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";
import type { AuthState } from "../../../shared/auth";

const studentAuth: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20260101", name: "张三", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Correct ids and copy the mocked judge answers with (the real ones live server-side). */
const MOCK_KEYS: Record<number, { correct: string; right: string; wrong: string }> = {
  2: {
    correct: "controller",
    right: "正确。控制器负责执行程序并协调各部件，运算器负责实际计算。",
    wrong: "再观察一下上一页：哪个部件向运算器发出了计算命令？",
  },
  3: { correct: "ram-cleared", right: "正确。内存断电就清空。", wrong: "再断一次电看看。" },
  4: { correct: "both", right: "正确。既是输入也是输出。", wrong: "再看一遍第 4 步。" },
};

/** Mock the network: catalog + project load; judge answers per the answer body. */
function mockApi(project: { currentStage?: number; passedStages?: number[] } = {}) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url.includes("/api/labs")) {
      return jsonResponse({
        labs: [
          {
            id: "five-parts",
            stageCount: 4,
            hidden: false,
            openClassIds: null,
            visible: true,
            visibleClassIds: ["c1"],
          },
        ],
      });
    }
    if (url.includes("/labs/five-parts/project")) {
      return jsonResponse({
        labId: "five-parts",
        currentStage: project.currentStage ?? 1,
        passedStages: project.passedStages ?? [],
        drafts: {},
        draftRevisions: {},
      });
    }
    if (url.includes("/labs/five-parts/draft")) {
      return jsonResponse({ ok: true, applied: true, revision: 1 });
    }
    if (url.includes("/labs/five-parts/judge")) {
      const { answer, stageIndex = 1 } = (body ?? {}) as { answer?: string; stageIndex?: number };
      const key = MOCK_KEYS[stageIndex];
      const passed = !key || answer === key.correct;
      return jsonResponse({
        passed,
        stageIndex,
        feedback: key ? (passed ? key.right : key.wrong) : null,
        submissionId: "sub-1",
        currentStage: 2,
        passedStages: passed ? [1, stageIndex] : [1],
        parts: [{ id: "answer", label: "答案", ok: passed, detail: null }],
      });
    }
    return jsonResponse({}, 404);
  });
  return { spy, calls };
}

/** The banned vocabulary must never reach the student UI. */
const FORBIDDEN = /PC|IR|LOAD|STORE|HALT|M\[\d+\]|寄存器|操作码|指令|汇编/;

const statusText = (el: HTMLElement) => el.textContent ?? "";

describe("FivePartsLabPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("walks the four steps, restarts on input change, and never shows banned words", async () => {
    mockApi();
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/five-parts", { auth: studentAuth });

    const main = await screen.findByRole("main", { name: "五大部件实验区" });
    expect(within(main).getByText("让计算机把两个数字相加")).toBeInTheDocument();
    // Step 0/4: output shows "—" (the output card's result line).
    const outputCard = within(main).getByRole("region", { name: "输出设备" });
    expect(within(outputCard).getByRole("status")).toHaveTextContent("—");
    expect(within(main).getByText(/步骤 0\/4/)).toBeInTheDocument();

    // Step through 1..4 — captions land on the right parts.
    const next = () => user.click(within(main).getByRole("button", { name: "执行下一步 →" }));
    await next();
    expect(statusText(main)).toContain("把输入的两个数字保存在存储器里");
    await next();
    expect(statusText(main)).toContain("控制器按照程序发出计算命令");
    await next();
    expect(statusText(main)).toContain("3 + 5 = 8");
    await next();
    expect(within(main).getByText(/步骤 4\/4/)).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "重新运行" })).toBeInTheDocument();

    // Reset returns to step 0 and the output clears.
    await user.click(within(main).getByRole("button", { name: "重新运行" }));
    expect(within(main).getByText(/步骤 0\/4/)).toBeInTheDocument();

    // Changing an input restarts the run.
    await user.click(within(main).getByRole("button", { name: "执行下一步 →" }));
    await user.click(within(main).getByRole("button", { name: "执行下一步 →" }));
    await user.click(within(main).getByRole("button", { name: "数字 A 加一" }));
    expect(within(main).getByText(/步骤 0\/4/)).toBeInTheDocument();
    expect(within(main).getByLabelText("数字 A 当前值")).toHaveTextContent("4");

    // Nowhere on either page may assembly-era vocabulary appear.
    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("gates continue until the demo completes, then the think page judges picks", async () => {
    mockApi();
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/five-parts", { auth: studentAuth });
    const main = await screen.findByRole("main", { name: "五大部件实验区" });

    const cont = within(main).getByRole("button", { name: "继续：观察与思考" });
    expect(cont).toBeDisabled();
    for (let i = 0; i < 4; i++) {
      await user.click(within(main).getByRole("button", { name: "执行下一步 →" }));
    }
    await waitFor(() => expect(cont).toBeEnabled());
    await user.click(cont);

    // Think page: one question, shared inputs, wrong then right pick.
    await screen.findByText("如果运算器只负责计算，那么是谁指挥它进行加法的？");
    await user.click(screen.getByRole("button", { name: "存储器" }));
    expect(
      await screen.findByText("再观察一下上一页：哪个部件向运算器发出了计算命令？"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "控制器" }));
    expect(
      await screen.findByText("正确。控制器负责执行程序并协调各部件，运算器负责实际计算。"),
    ).toBeInTheDocument();

    // 返回观察 keeps the shared inputs and step.
    await user.click(screen.getByRole("button", { name: "返回观察" }));
    const backMain = await screen.findByRole("main", { name: "五大部件实验区" });
    expect(within(backMain).getByLabelText("数字 A 当前值")).toHaveTextContent("3");
    expect(within(backMain).getByText(/步骤 4\/4/)).toBeInTheDocument();

    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("lets the student see memory clear on power-off while saved storage survives", async () => {
    const { calls } = mockApi({ currentStage: 3, passedStages: [1] });
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/five-parts", { auth: studentAuth });
    const main = await screen.findByRole("main", { name: "五大部件实验区" });
    await within(main).findByText("内存与外存：断电会怎样？", { selector: "h1" });

    const memory = within(main).getByRole("region", { name: "内存" });
    const disk = within(main).getByRole("region", { name: "外存" });
    const cpu = within(main).getByRole("region", { name: "CPU" });
    const press = (name: string) => user.click(within(main).getByRole("button", { name }));

    // Nothing is in memory yet: the CPU cannot get at the file on storage.
    await press("让 CPU 数字数");
    expect(statusText(main)).toContain("CPU 拿不到数据");
    expect(within(cpu).getByText("还没有读取数据")).toBeInTheDocument();

    // Open copies the file into memory; writing changes only memory.
    await press("打开文件");
    await press("写一句");
    expect(within(memory).getAllByRole("listitem")).toHaveLength(2);
    expect(within(disk).getAllByRole("listitem")).toHaveLength(1);
    expect(within(memory).getByText("有没保存的改动")).toBeInTheDocument();
    await press("让 CPU 数字数");
    expect(within(cpu).getByText(/数出：2 句/)).toBeInTheDocument();

    // Power off: memory empties, storage keeps the saved sentence.
    await press("断电");
    expect(within(memory).getByText("（已断电，空）")).toBeInTheDocument();
    expect(within(disk).getAllByRole("listitem")).toHaveLength(1);
    expect(within(main).getByRole("button", { name: "打开文件" })).toBeDisabled();
    await press("开机");
    expect(within(memory).getByText("（空）")).toBeInTheDocument();

    // The question is judged server-side; the copy comes back from the judge.
    await user.click(screen.getByRole("button", { name: "断电时，电脑会自动删掉最后写的一句" }));
    expect(await screen.findByText("再断一次电看看。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "那句只在内存里，内存一断电就清空" }));
    expect(await screen.findByText("正确。内存断电就清空。")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/judge")).map((c) => c.body)).toEqual([
      { stageIndex: 3, answer: "auto-delete" },
      { stageIndex: 3, answer: "ram-cleared" },
    ]);

    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("shows the touch screen taking an input role and later an output role", async () => {
    mockApi({ currentStage: 4, passedStages: [1] });
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/five-parts", { auth: studentAuth });
    const main = await screen.findByRole("main", { name: "五大部件实验区" });
    await within(main).findByText("手机里的五大部件", { selector: "h1" });

    const touch = within(main).getByRole("region", { name: "触摸屏" });
    const next = () => user.click(within(main).getByRole("button", { name: "执行下一步 →" }));
    expect(within(main).getByText(/步骤 0\/5/)).toBeInTheDocument();
    await next();
    expect(within(touch).getByText("输入设备")).toBeInTheDocument();
    expect(within(touch).queryByText("输出设备")).not.toBeInTheDocument();
    await next();
    await next();
    await next();
    expect(within(touch).getByText("输出设备")).toBeInTheDocument();
    expect(touch).toHaveClass("is-active");
    await next();
    expect(
      within(within(main).getByRole("region", { name: "存储空间" })).getByText("存储器 · 外存"),
    ).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "重新运行" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "只是输入设备" }));
    expect(await screen.findByText("再看一遍第 4 步。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "既是输入设备，也是输出设备" }));
    expect(await screen.findByText("正确。既是输入也是输出。")).toBeInTheDocument();

    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});

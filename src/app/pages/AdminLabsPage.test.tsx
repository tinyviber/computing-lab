import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminAuthState, renderAppAt } from "../../test/router-test-helpers";

const labs = [
  { id: "calculator", stageCount: 7, hidden: false },
  { id: "cpu", stageCount: 5, hidden: true },
];

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AdminLabsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("manages lab visibility on its own route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "PUT") return jsonResponse({ ok: true });
      if (String(input).includes("/api/labs")) return jsonResponse({ labs });
      return jsonResponse({});
    });
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "实验管理" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "管理模块" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "隐藏" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/calculator/visibility",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ hidden: true }) }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "恢复开放" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/cpu/visibility",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ hidden: false }) }),
      ),
    );
  });
});

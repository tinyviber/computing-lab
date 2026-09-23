import { stageCount } from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph } from "../../src/features/calculator/domain/graph.ts";
import type { CalculatorJudgeResult } from "../../src/features/calculator/domain/protocol.ts";
import { judgeSubmission, saveDraft } from "../judge/run.ts";
import { labRoutes } from "./labRoutes.ts";

export function calculatorRoutes() {
  return labRoutes<CircuitGraph, CalculatorJudgeResult>({
    labId: "calculator",
    stageCount,
    projectExtras: (project) => ({ unlockedSubmodules: project.unlockedSubmodules }),
    saveDraft: (db, project, stageIndex, body) =>
      saveDraft(db, project, stageIndex, body.graph ?? {}, body.components),
    judge: (db, project, stageIndex, body) =>
      judgeSubmission(db, project, stageIndex, body.graph, body.components),
  });
}

export { TaskSheetEditor, QUESTION_KIND_LABELS } from "./ui/TaskSheetEditor";
export { editorReducer, type EditorState } from "./lesson/editorState";
export { type EditorAction } from "./lesson/editorActions";
export { cleanForSave, questionProblem, sheetComplete } from "./domain/validation";
export { QuestionAnswer, type PublicGrading } from "./ui/QuestionFields";
export { TaskSheetPreview } from "./ui/TaskSheetPreview";
export {
  BLANK_MARKER,
  publicSchema,
  countPromptBlanks,
  splitPromptBlanks,
  validateSheetSchema,
  SHEET_LIMITS,
  type ChoiceQuestion,
  type FillQuestion,
  type PromptSegment,
  type PublicQuestion,
  type PublicSheetSchema,
  type Question,
  type SheetSchema,
  type ShortQuestion,
} from "./domain/schema";
export {
  autoGrade,
  publicGrading,
  sanitizeAnswers,
  validateAnswers,
  type AnswerMap,
  type AnswerValue,
  type QuestionGrading,
} from "./domain/grade";

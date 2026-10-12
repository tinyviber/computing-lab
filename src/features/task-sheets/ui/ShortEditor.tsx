/**
 * Short-answer question editor: max score plus the teacher-only reference
 * answer shown while grading.
 */

import type { Dispatch } from "react";
import type { ShortQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { NumberInput } from "./NumberInput";

export function ShortEditor({
  q,
  dispatch,
}: {
  q: ShortQuestion;
  dispatch: Dispatch<EditorAction>;
}) {
  const patch = (next: Partial<ShortQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  return (
    <div className="ts-q-body">
      <NumberInput label="满分" onChange={(maxScore) => patch({ maxScore })} value={q.maxScore} />
      <label className="ts-field">
        <span>参考答案（教师批卷时参考，学生不可见）</span>
        <textarea
          onChange={(e) => patch({ referenceAnswer: e.target.value })}
          rows={2}
          value={q.referenceAnswer ?? ""}
        />
      </label>
    </div>
  );
}

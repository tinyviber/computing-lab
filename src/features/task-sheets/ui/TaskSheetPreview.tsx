/**
 * Teacher-side preview of a task sheet exactly as students will see it:
 * questions rendered through publicSchema() (answer keys stripped) with the
 * same QuestionAnswer cards used by the assignment page. Answers are held in
 * local state only — previewing never touches the network or saves anything.
 */

import { useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import type { AnswerMap, AnswerValue } from "../domain/grade";
import type { PublicQuestion } from "../domain/schema";
import { QuestionAnswer } from "./QuestionFields";

export function TaskSheetPreview({
  title,
  description,
  questions,
  onClose,
}: {
  title: string;
  description: string;
  questions: PublicQuestion[];
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const setAnswer = (qid: string, value: AnswerValue) =>
    setAnswers((a) => ({ ...a, [qid]: value }));

  return (
    <div className="ts-preview-scrim" role="presentation" onClick={onClose}>
      <div
        aria-label={`预览「${title}」`}
        className="ts-preview"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="ts-preview-head">
          <div>
            <p className="eyebrow">任务单 / 预览</p>
            <h2>{title}</h2>
            {description.trim() !== "" ? <p className="ts-preview-desc">{description}</p> : null}
          </div>
          <button
            aria-label="关闭预览"
            className="icon-button ts-preview-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <p className="ts-preview-note" role="status">
          预览模式——这是学生看到的作答页。这里的填写不会被保存，也不会产生提交。
        </p>

        {questions.length === 0 ? (
          <p className="ts-empty">这份任务单还没有题目。</p>
        ) : (
          <div className="ts-answer-list">
            {questions.map((q, i) => (
              <QuestionAnswer
                index={i}
                key={q.id}
                onChange={(v) => setAnswer(q.id, v)}
                q={q}
                value={answers[q.id]}
              />
            ))}
          </div>
        )}

        <div className="ts-actions">
          <button className="button button-primary" disabled type="button">
            提交
          </button>
          <button className="button button-secondary" onClick={onClose} type="button">
            关闭预览
          </button>
        </div>
      </div>
    </div>
  );
}

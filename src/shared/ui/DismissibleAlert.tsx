import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Error banner with a dismiss button — the `.test-error` chrome shared by
 * lab pages that surface a closable message.
 */
export function DismissibleAlert({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <p className="test-error" role="alert">
      {children}
      <button aria-label="关闭" onClick={onDismiss} type="button">
        <Icon name="x" size={12} />
      </button>
    </p>
  );
}

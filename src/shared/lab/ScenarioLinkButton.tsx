/**
 * ScenarioLinkButton: copy-to-clipboard link generator for reproducible lab scenarios.
 *
 * Only rendered for staff (teacher/admin) because scenario params encode submission content.
 * Creates a link by dropping ALL current query params (lab routes only read scenario keys)
 * and building a clean URL from origin + pathname + the provided search record.
 */

import { useEffect, useRef, useState } from "react";

export function ScenarioLinkButton({ search }: { search: Record<string, string | number> }) {
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const copyTimeout = useRef<number | null>(null);
  const fallbackInput = useRef<HTMLInputElement>(null);

  const link = (() => {
    const url = new URL(window.location.origin + window.location.pathname);
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  })();

  const copyScenarioLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFallback(false);
      if (copyTimeout.current !== null) clearTimeout(copyTimeout.current);
      copyTimeout.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeout.current = null;
      }, 1500);
    } catch {
      setCopyFallback(true);
      setCopied(false);
    }
  };

  // Focus and select fallback input when it appears
  useEffect(() => {
    if (copyFallback && fallbackInput.current) {
      fallbackInput.current.focus();
      fallbackInput.current.select();
    }
  }, [copyFallback]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeout.current !== null) clearTimeout(copyTimeout.current);
    };
  }, []);

  return (
    <div className="scenario-link">
      <button className="button button-ghost" onClick={() => void copyScenarioLink()} type="button">
        {copied ? "已复制" : "复制实验链接"}
      </button>
      <span className="scenario-link-hint">
        同班同学打开后会载入这一关和这组参数（该关需已解锁）
      </span>
      {copyFallback ? (
        <div className="scenario-link-fallback">
          <p>复制下面的链接</p>
          <input aria-label="实验链接" readOnly ref={fallbackInput} type="text" value={link} />
        </div>
      ) : null}
    </div>
  );
}

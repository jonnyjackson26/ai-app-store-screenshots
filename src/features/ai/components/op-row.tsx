"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { DEFAULT_NUM_PAGES, DEFAULT_PAGE_GAP } from "@/features/editor/types";
import type { AiOp } from "@/features/ai/types";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false, loading: () => <div className="text-[10px] text-muted-foreground p-2">Loading diff…</div> },
);

interface OpRowProps {
  op: AiOp;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  baselineJson: object | null;
}

const opKindLabel = (op: AiOp): string => {
  if (op.kind === "modify_object") return "Modify";
  if (op.kind === "add_object") return `Add ${op.objectType}`;
  if (op.kind === "remove_object") return "Remove";
  return "Page settings";
};

type AnyObject = Record<string, unknown>;

interface BaselineShape {
  objects?: AnyObject[];
  background?: string;
}

const findBaselineObject = (
  baseline: object | null,
  id: string,
): AnyObject | null => {
  if (!baseline) return null;
  const objects = (baseline as BaselineShape).objects;
  if (!Array.isArray(objects)) return null;
  return (objects.find((o) => (o as AnyObject).id === id) as AnyObject) ?? null;
};

const findWorkspace = (baseline: object | null): AnyObject | null => {
  if (!baseline) return null;
  const objects = (baseline as BaselineShape).objects;
  if (!Array.isArray(objects)) return null;
  return (objects.find((o) => (o as AnyObject).name === "clip") as AnyObject) ?? null;
};

// For a modify_object op, only show keys the AI is touching plus the
// baseline values for those same keys. Keeps the diff focused on the
// actual change instead of dumping every Fabric property.
const projectModified = (
  baseline: AnyObject | null,
  patch: AnyObject,
): { before: AnyObject; after: AnyObject } => {
  const before: AnyObject = {};
  const after: AnyObject = {};
  for (const key of Object.keys(patch)) {
    before[key] = baseline ? baseline[key] ?? null : null;
    after[key] = patch[key];
  }
  return { before, after };
};

const buildDiff = (
  op: AiOp,
  baseline: object | null,
): { before: string; after: string } => {
  if (op.kind === "modify_object") {
    const baseObj = findBaselineObject(baseline, op.targetId);
    const { before, after } = projectModified(baseObj, op.props as AnyObject);
    return {
      before: JSON.stringify(before, null, 2),
      after: JSON.stringify(after, null, 2),
    };
  }
  if (op.kind === "remove_object") {
    const baseObj = findBaselineObject(baseline, op.targetId);
    return {
      before: baseObj ? JSON.stringify(baseObj, null, 2) : "{}",
      after: "",
    };
  }
  if (op.kind === "add_object") {
    return {
      before: "",
      after: JSON.stringify(
        { type: op.objectType, ...(op.props as AnyObject) },
        null,
        2,
      ),
    };
  }
  // set_page_settings: diff against the workspace + page fields
  const ws = findWorkspace(baseline);
  const before: AnyObject = {
    width: ws?.width ?? 0,
    height: ws?.height ?? 0,
    numPages: ws?.numPages ?? DEFAULT_NUM_PAGES,
    pageGap: ws?.pageGap ?? DEFAULT_PAGE_GAP,
    background: ws?.fill ?? "#ffffff",
  };
  const beforeProjected: AnyObject = {};
  const after: AnyObject = {};
  for (const key of Object.keys(op.props)) {
    beforeProjected[key] = before[key] ?? null;
    after[key] = (op.props as AnyObject)[key];
  }
  return {
    before: JSON.stringify(beforeProjected, null, 2),
    after: JSON.stringify(after, null, 2),
  };
};

export const OpRow = ({ op, checked, onToggle, disabled, baselineJson }: OpRowProps) => {
  const [expanded, setExpanded] = useState(false);

  const diff = useMemo(() => buildDiff(op, baselineJson), [op, baselineJson]);
  // Approximate height: number of lines in the larger side, clamped.
  const lines = Math.max(
    diff.before.split("\n").length,
    diff.after.split("\n").length,
  );
  const diffHeight = Math.min(280, Math.max(80, lines * 18 + 16));

  return (
    <div className="border rounded-md text-xs bg-white">
      <div className="flex items-start gap-x-2 p-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="mt-0.5 cursor-pointer"
        />
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left flex items-start gap-x-1.5"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium leading-tight">{op.summary}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              {opKindLabel(op)}
              {(op.kind === "modify_object" || op.kind === "remove_object") &&
                ` · ${op.targetId}`}
            </p>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="border-t" style={{ height: diffHeight }}>
          <DiffEditor
            language="json"
            theme="vs"
            original={diff.before}
            modified={diff.after}
            options={{
              renderSideBySide: false,
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "off",
              folding: false,
              fontSize: 11,
              renderOverviewRuler: false,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              automaticLayout: true,
            }}
          />
        </div>
      )}
    </div>
  );
};

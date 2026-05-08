"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { AiOp } from "@/features/ai/types";
import { cn } from "@/lib/utils";

interface OpRowProps {
  op: AiOp;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const opKindLabel = (op: AiOp): string => {
  if (op.kind === "modify_object") return "Modify";
  if (op.kind === "add_object") return `Add ${op.objectType}`;
  if (op.kind === "remove_object") return "Remove";
  return "Page settings";
};

const opPropsForDisplay = (op: AiOp): Record<string, unknown> => {
  if (op.kind === "modify_object" || op.kind === "add_object") return op.props;
  if (op.kind === "set_page_settings") return op.props;
  if (op.kind === "remove_object") return { targetId: op.targetId };
  return {};
};

export const OpRow = ({ op, checked, onToggle, disabled }: OpRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const props = opPropsForDisplay(op);

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
        <pre
          className={cn(
            "border-t bg-muted/40 p-2 text-[10px] leading-snug overflow-x-auto",
            "font-mono",
          )}
        >
          {JSON.stringify(props, null, 2)}
        </pre>
      )}
    </div>
  );
};

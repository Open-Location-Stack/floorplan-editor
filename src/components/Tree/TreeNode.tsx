import type { ReactNode } from "react";

type TreeNodeProps = {
  label: ReactNode;
  depth: number;
  selected: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  actions?: ReactNode;
};

export const TreeNode = ({
  label,
  depth,
  selected,
  expandable = false,
  expanded = false,
  onToggle,
  onSelect,
  actions,
}: TreeNodeProps) => (
  <div
    className={`flex items-center gap-1 rounded-md px-1 py-0.5 ${
      selected ? "bg-primary/15" : "hover:bg-base-200"
    }`}
    style={{ paddingLeft: `${depth * 16 + 4}px` }}
  >
    {expandable ? (
      <button
        type="button"
        className="btn btn-ghost btn-xs px-1"
        aria-label={expanded ? "Collapse" : "Expand"}
        onClick={onToggle}
      >
        {expanded ? "-" : "+"}
      </button>
    ) : (
      <span className="inline-block w-6" />
    )}
    <button
      type="button"
      className={`btn btn-ghost btn-sm h-auto min-h-0 flex-1 justify-start px-2 py-1 text-left ${
        selected ? "font-semibold" : ""
      }`}
      onClick={onSelect}
    >
      {label}
    </button>
    {actions}
  </div>
);

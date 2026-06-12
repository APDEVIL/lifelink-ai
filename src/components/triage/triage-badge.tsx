import { cn } from "@/lib/utils";

export type TriagePriority = "P1" | "P2" | "P3" | "P4";

interface TriageBadgeProps {
  priority: TriagePriority;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

const PRIORITY_CONFIG: Record<
  TriagePriority,
  { label: string; sub: string; bg: string; text: string; border: string; dot: string }
> = {
  P1: {
    label: "P1",
    sub: "Immediate",
    bg: "bg-red-950/80",
    text: "text-red-300",
    border: "border-red-500/60",
    dot: "bg-red-400",
  },
  P2: {
    label: "P2",
    sub: "Urgent",
    bg: "bg-orange-950/80",
    text: "text-orange-300",
    border: "border-orange-500/60",
    dot: "bg-orange-400",
  },
  P3: {
    label: "P3",
    sub: "Delayed",
    bg: "bg-yellow-950/80",
    text: "text-yellow-300",
    border: "border-yellow-500/60",
    dot: "bg-yellow-400",
  },
  P4: {
    label: "P4",
    sub: "Expectant",
    bg: "bg-zinc-900/80",
    text: "text-zinc-400",
    border: "border-zinc-600/60",
    dot: "bg-zinc-500",
  },
};

const SIZE_CLASSES = {
  sm: { wrap: "px-2 py-0.5 text-xs gap-1", dot: "w-1.5 h-1.5" },
  md: { wrap: "px-3 py-1 text-sm gap-1.5", dot: "w-2 h-2" },
  lg: { wrap: "px-4 py-2 text-base gap-2 font-bold", dot: "w-2.5 h-2.5" },
};

export function TriageBadge({
  priority,
  showLabel = false,
  size = "md",
  pulse = false,
  className,
}: TriageBadgeProps) {
  const cfg = PRIORITY_CONFIG[priority];
  const sz = SIZE_CLASSES[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-mono font-semibold tracking-wider",
        cfg.bg,
        cfg.text,
        cfg.border,
        sz.wrap,
        className
      )}
    >
      <span className="relative flex shrink-0">
        <span
          className={cn(
            "rounded-full",
            cfg.dot,
            sz.dot,
            pulse && priority === "P1" && "animate-ping absolute inline-flex opacity-75"
          )}
        />
        {pulse && priority === "P1" && (
          <span className={cn("relative inline-flex rounded-full", cfg.dot, sz.dot)} />
        )}
      </span>
      {cfg.label}
      {showLabel && (
        <span className="ml-1 font-normal opacity-70 tracking-normal font-sans">
          {cfg.sub}
        </span>
      )}
    </span>
  );
}

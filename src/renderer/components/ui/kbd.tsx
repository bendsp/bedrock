import * as React from "react";
import { cn } from "../../lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-7 w-fit min-w-7 items-center justify-center gap-1.5 rounded-md px-2 font-sans text-sm font-semibold select-none",
        "bg-[color:color-mix(in_srgb,var(--text-body)_22%,var(--bg-body)_78%)]",
        "text-[color:inherit] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-body)_28%,transparent)]",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:text-[color:inherit]",
        "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };

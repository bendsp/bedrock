import * as React from "react";
import { cn } from "../../lib/utils";

const Kbd = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)]/70 px-3 text-[11px] font-mono font-medium leading-none text-[color:var(--button-text)] shadow-sm",
      className
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";

const KbdGroup = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("inline-flex items-center gap-1", className)}>
    {children}
  </div>
);

export { Kbd, KbdGroup };

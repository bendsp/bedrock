import * as React from "react";
import { cn } from "../../lib/utils";

const Kbd = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-md border border-[color:var(--button-border)] bg-[color:var(--panel-bg)]/30 px-2 py-1 text-[11px] font-medium leading-none text-[color:var(--button-text)] shadow-sm",
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

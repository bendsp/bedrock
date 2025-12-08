import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--button-bg)] text-[color:var(--button-text)] border border-[color:var(--button-border)] hover:brightness-110",
        secondary:
          "bg-[color:var(--panel-bg)] text-[color:var(--panel-text)] border border-[color:var(--panel-border)] hover:brightness-110",
        outline:
          "border border-[color:var(--panel-border)] text-[color:var(--panel-text)] hover:bg-[color:var(--panel-bg)]",
        ghost:
          "text-[color:var(--panel-text)] hover:bg-[color:var(--panel-bg)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 rounded-sm",
        lg: "h-10 px-6 rounded-lg",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };


"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 border font-medium uppercase tracking-[0.28em] text-[11px] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:bg-[#1b1b1b]",
        outline:
          "border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]",
        ghost:
          "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
        amber:
          "border-[var(--accent)] bg-[var(--accent)] text-black hover:bg-[#ffb423]",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-[10px]",
        lg: "h-12 px-5",
        icon: "size-11 p-0 tracking-[0.1em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden border text-center text-[10px] font-medium uppercase leading-4 tracking-[0.14em] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent) sm:text-[11px] sm:tracking-[0.2em]",
  {
    variants: {
      variant: {
        default:
          "border-(--border) bg-(--surface-2) text-foreground hover:bg-[#1b1b1b]",
        outline:
          "border-(--border) bg-transparent text-foreground hover:bg-[rgba(255,255,255,0.04)]",
        ghost:
          "border-transparent bg-transparent text-(--text-muted) hover:border-(--border) hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground",
        amber:
          "border-(--accent) bg-(--accent) text-black hover:bg-[rgba(197,160,89,0.88)]",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-[10px] tracking-[0.14em]",
        lg: "h-12 px-5",
        icon: "size-11 p-0 tracking-widest",
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

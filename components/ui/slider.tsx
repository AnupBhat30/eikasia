"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

// The thumb stays locally controlled at pointer rate. The first value is sent
// immediately, following values are sampled at ~30fps, and release flushes the
// exact final value. This keeps the canvas responsive without flooding it.
const PROJECT_UPDATE_INTERVAL_MS = 32;

function sameValue(first: number[] | undefined, second: number[]) {
  return (
    first?.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider(
  {
    className,
    value,
    onValueChange,
    onValueCommit,
    ...props
  },
  ref,
) {
  const controlled = value !== undefined;
  const [liveValue, setLiveValue] = React.useState(value);
  const interactingRef = React.useRef(false);
  const pendingValueRef = React.useRef<number[] | null>(null);
  const lastSentValueRef = React.useRef<number[] | undefined>(value);
  const updateTimerRef = React.useRef(0);
  const onValueChangeRef = React.useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  React.useEffect(() => {
    if (!interactingRef.current) {
      setLiveValue(value);
      lastSentValueRef.current = value;
    }
  }, [value]);

  React.useEffect(
    () => () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
    },
    [],
  );

  const flushPendingValue = React.useCallback(() => {
    updateTimerRef.current = 0;
    const pendingValue = pendingValueRef.current;
    pendingValueRef.current = null;

    if (
      pendingValue &&
      !sameValue(lastSentValueRef.current, pendingValue)
    ) {
      lastSentValueRef.current = pendingValue;
      onValueChangeRef.current?.(pendingValue);
    }
  }, []);

  const handleValueChange = React.useCallback(
    (nextValue: number[]) => {
      interactingRef.current = true;
      if (controlled) {
        setLiveValue(nextValue);
      }
      if (!updateTimerRef.current) {
        pendingValueRef.current = null;
        if (!sameValue(lastSentValueRef.current, nextValue)) {
          lastSentValueRef.current = nextValue;
          onValueChangeRef.current?.(nextValue);
        }
        updateTimerRef.current = window.setTimeout(
          flushPendingValue,
          PROJECT_UPDATE_INTERVAL_MS,
        );
      } else {
        pendingValueRef.current = nextValue;
      }
    },
    [controlled, flushPendingValue],
  );

  const handleValueCommit = React.useCallback(
    (nextValue: number[]) => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
      pendingValueRef.current = nextValue;
      flushPendingValue();
      interactingRef.current = false;
      if (controlled) {
        setLiveValue(nextValue);
      }
      onValueCommit?.(nextValue);
    },
    [controlled, flushPendingValue, onValueCommit],
  );

  return (
    <SliderPrimitive.Root
      ref={ref}
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-pan-y select-none items-center",
        className,
      )}
      value={controlled ? liveValue : undefined}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-[#202020]"
      >
        <SliderPrimitive.Range className="absolute h-full bg-[var(--accent)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-5 rounded-full border border-black bg-[var(--accent)] shadow-[0_0_0_1px_var(--accent-shadow)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

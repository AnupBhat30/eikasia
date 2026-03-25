import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function fromPercentage(value: number, total: number) {
  return (value / 100) * total;
}

export function toPercentage(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return (value / total) * 100;
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function round(value: number, precision = 2) {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

export function formatSignedValue(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

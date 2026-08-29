import { describe, expect, test } from "bun:test";

import {
  selectPendingPreviewJob,
  type PreviewQueueItem,
} from "@/lib/preview-render-scheduling";

type TestJob = PreviewQueueItem & { value?: number };

describe("preview latest-value scheduling", () => {
  test("a new adjustment replaces stale queued work", () => {
    const stale: TestJob = { revision: 3, quality: "fast", value: 20 };
    const newest: TestJob = { revision: 7, quality: "fast", value: 80 };

    expect(selectPendingPreviewJob(stale, newest)).toBe(newest);
  });

  test("refinement cannot jump ahead of the fast current frame", () => {
    const fast: TestJob = { revision: 9, quality: "fast" };
    const full: TestJob = { revision: 9, quality: "full" };

    expect(selectPendingPreviewJob(fast, full)).toBe(fast);
  });

  test("fast work replaces a queued refinement for the same revision", () => {
    const full: TestJob = { revision: 11, quality: "full" };
    const fast: TestJob = { revision: 11, quality: "fast" };

    expect(selectPendingPreviewJob(full, fast)).toBe(fast);
  });
});

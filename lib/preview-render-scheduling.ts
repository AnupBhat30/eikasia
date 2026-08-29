export interface PreviewQueueItem {
  revision: number;
  quality: "fast" | "full";
}

export function selectPendingPreviewJob<T extends PreviewQueueItem>(
  pending: T | null,
  incoming: T,
): T {
  if (
    !pending ||
    incoming.revision > pending.revision ||
    incoming.quality === "fast"
  ) {
    return incoming;
  }

  // A settled full-quality job must never replace the fast job for the same
  // revision: the user should see the current value before refinement.
  return pending;
}

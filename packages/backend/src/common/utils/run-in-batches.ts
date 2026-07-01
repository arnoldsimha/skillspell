/**
 * Run an async operation over a list of items in fixed-size concurrent batches.
 *
 * Items within a batch run in parallel (Promise.all); batches run sequentially.
 * This is the shared concurrency primitive for the eval execution and
 * optimization runners, which differ in their per-item work (persistence/dedup
 * vs in-memory grading) but share the same batching skeleton.
 *
 * If an AbortSignal is provided and already aborted at a batch boundary, the
 * function stops and returns the results accumulated so far (callers that need
 * mid-flight cancellation should also check the signal inside `fn`).
 *
 * @param items        Items to process.
 * @param concurrency  Max items processed in parallel per batch (>= 1).
 * @param fn           Async worker invoked with (item, absoluteIndex).
 * @param opts.signal  Optional abort signal; checked before each batch.
 * @param opts.onBatchStart    Called before a batch runs: (batchIndex, batch, startOffset).
 * @param opts.onBatchComplete Called after a batch resolves: (completedCount, total).
 * @returns Results in input order (for the batches that ran).
 */
export async function runInBatches<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
  opts?: {
    signal?: AbortSignal;
    onBatchStart?: (
      batchIndex: number,
      batch: TIn[],
      startOffset: number,
    ) => void;
    onBatchComplete?: (completed: number, total: number) => void;
  },
): Promise<TOut[]> {
  const size = Math.max(1, concurrency);
  const results: TOut[] = [];

  for (let i = 0; i < items.length; i += size) {
    if (opts?.signal?.aborted) break;

    const batch = items.slice(i, i + size);
    opts?.onBatchStart?.(Math.floor(i / size), batch, i);

    const batchResults = await Promise.all(
      batch.map((item, j) => fn(item, i + j)),
    );

    results.push(...batchResults);
    opts?.onBatchComplete?.(results.length, items.length);
  }

  return results;
}

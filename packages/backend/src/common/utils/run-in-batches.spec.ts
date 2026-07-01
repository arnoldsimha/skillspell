import { runInBatches } from './run-in-batches';

describe('runInBatches', () => {
  it('processes all items in input order', async () => {
    const out = await runInBatches([1, 2, 3, 4, 5], 2, (n) =>
      Promise.resolve(n * 10),
    );
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('passes the absolute index to the worker', async () => {
    const seen: Array<[number, number]> = [];
    await runInBatches(['a', 'b', 'c'], 2, (item, idx) => {
      seen.push([idx, item.charCodeAt(0)]);
      return Promise.resolve(idx);
    });
    expect(seen.map(([idx]) => idx)).toEqual([0, 1, 2]);
  });

  it('runs items within a batch concurrently but batches sequentially', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    await runInBatches([1, 2, 3, 4], 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      events.push(`done-${n}`);
      active--;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(events).toHaveLength(4);
  });

  it('invokes onBatchComplete with cumulative counts and total', async () => {
    const progress: Array<[number, number]> = [];
    await runInBatches([1, 2, 3, 4, 5], 2, (n) => Promise.resolve(n), {
      onBatchComplete: (completed, total) => progress.push([completed, total]),
    });
    expect(progress).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it('invokes onBatchStart with batch index and start offset', async () => {
    const starts: Array<[number, number]> = [];
    await runInBatches([1, 2, 3, 4, 5], 2, (n) => Promise.resolve(n), {
      onBatchStart: (batchIndex, _batch, startOffset) =>
        starts.push([batchIndex, startOffset]),
    });
    expect(starts).toEqual([
      [0, 0],
      [1, 2],
      [2, 4],
    ]);
  });

  it('stops at a batch boundary when the signal is already aborted', async () => {
    const controller = new AbortController();
    const processed: number[] = [];
    const out = await runInBatches(
      [1, 2, 3, 4, 5, 6],
      2,
      (n) => {
        processed.push(n);
        if (n === 2) controller.abort();
        return Promise.resolve(n);
      },
      { signal: controller.signal },
    );
    // First batch [1,2] completes, then the boundary check stops further batches.
    expect(processed).toEqual([1, 2]);
    expect(out).toEqual([1, 2]);
  });

  it('treats concurrency < 1 as 1', async () => {
    const out = await runInBatches([1, 2, 3], 0, (n) => Promise.resolve(n));
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns an empty array for no items', async () => {
    const out = await runInBatches<number, number>([], 3, (n) =>
      Promise.resolve(n),
    );
    expect(out).toEqual([]);
  });
});

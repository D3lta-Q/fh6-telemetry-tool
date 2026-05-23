/**
 * Fixed-capacity ring buffer of synchronized (timestamp, ...values) samples.
 *
 * Why a ring buffer instead of an unbounded array?
 *
 * The game streams telemetry at up to 240 Hz. If the user leaves the app open
 * for an hour that is ~864,000 samples per channel - more than enough to make
 * uPlot stutter and the JS heap balloon. A ring buffer caps memory and lets
 * uPlot redraw in O(N) where N is bounded by capacity.
 *
 * MEMORY DISCIPLINE
 * -----------------
 * The first version of snapshot() allocated fresh arrays every call. At RAF
 * cadence (60 Hz) with a 60-second window at 240 Hz packets, each chart was
 * allocating ~115 KB per frame. Across five charts that meant ~40 MB/sec of
 * pure GC churn - more than V8's GC could reclaim in real time, so the heap
 * grew unboundedly (we saw 11 GB inside one minute).
 *
 * The fix here is that snapshot() now writes into PERSISTENT SCRATCH arrays
 * owned by the buffer instance. uPlot's setData() processes data on the call
 * and doesn't retain the reference, so reusing arrays between frames is safe.
 *
 * Caveat: callers must NOT hold onto the snapshot result between calls. The
 * returned arrays' contents will be overwritten on the next snapshot.
 */
export class RingBuffer {
  /** Number of value channels (excluding timestamp). */
  readonly channels: number;
  readonly capacity: number;

  /** xs[i] is the timestamp of sample i in seconds. */
  private xs: Float64Array;
  /** ys[c][i] is the value of channel c at sample i. */
  private ys: Float64Array[];

  /** Index where the NEXT sample will be written. */
  private writeIndex = 0;
  /** Total number of samples written. Caps at capacity. */
  private size = 0;

  // ---- Persistent scratch space for snapshot() ----
  // Sized to `capacity` once so they never reallocate. We mutate the contents
  // and set .length to the actual sample count each call.
  private scratchXs: number[];
  private scratchYs: number[][];
  /** A pre-built tuple [scratchXs, scratchYs[0], scratchYs[1], ...] returned by snapshot(). */
  private scratchTuple: [number[], ...number[][]];

  constructor(channels: number, capacity: number) {
    this.channels = channels;
    this.capacity = capacity;
    this.xs = new Float64Array(capacity);
    this.ys = Array.from({ length: channels }, () => new Float64Array(capacity));

    // Preallocate the scratch arrays at full capacity. Regular Arrays (not
    // typed) because uPlot accepts both and Arrays are friendlier to consume
    // with destructuring/spread.
    this.scratchXs = new Array<number>(capacity).fill(0);
    this.scratchYs = Array.from({ length: channels }, () => new Array<number>(capacity).fill(0));
    this.scratchTuple = [this.scratchXs, ...this.scratchYs];
  }

  push(timestamp: number, values: number[]): void {
    this.xs[this.writeIndex] = timestamp;
    for (let c = 0; c < this.channels; c++) {
      this.ys[c]![this.writeIndex] = values[c] ?? 0;
    }
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  clear(): void {
    this.writeIndex = 0;
    this.size = 0;
  }

  /**
   * Return a uPlot-shaped [xs, ...ys] tuple over the most recent samples that
   * fall within `windowSec` seconds of the latest timestamp.
   *
   * THE RETURNED ARRAYS ARE REUSED ACROSS CALLS. Do not hold onto the result
   * past the next snapshot call. uPlot's setData() consumes the data on the
   * spot, so this is fine for our use case but a footgun if used elsewhere.
   */
  snapshot(windowSec: number): [number[], ...number[][]] {
    const xs = this.scratchXs;
    const ys = this.scratchYs;

    if (this.size === 0) {
      xs.length = 0;
      for (let c = 0; c < this.channels; c++) ys[c]!.length = 0;
      return this.scratchTuple;
    }

    // Walk samples in chronological order. Start at the oldest valid index.
    const start = this.size < this.capacity ? 0 : this.writeIndex;
    const latest = this.xs[(this.writeIndex - 1 + this.capacity) % this.capacity]!;
    const minT = latest - windowSec;

    let outIdx = 0;
    for (let i = 0; i < this.size; i++) {
      const idx = (start + i) % this.capacity;
      const t = this.xs[idx]!;
      if (t < minT) continue;
      xs[outIdx] = t;
      for (let c = 0; c < this.channels; c++) {
        ys[c]![outIdx] = this.ys[c]![idx]!;
      }
      outIdx += 1;
    }

    // Setting length truncates the visible portion without changing the backing
    // store - so on the next snapshot we have the same allocated slots ready.
    xs.length = outIdx;
    for (let c = 0; c < this.channels; c++) ys[c]!.length = outIdx;
    return this.scratchTuple;
  }

  /** Resize while preserving the latest samples that still fit. */
  resize(newCapacity: number): void {
    if (newCapacity === this.capacity) return;
    // Snapshot into a temporary copy because we're about to overwrite scratch.
    const oldSnap = this.snapshot(Number.POSITIVE_INFINITY);
    const xsCopy = oldSnap[0].slice();
    const ysCopy: number[][] = [];
    for (let c = 0; c < this.channels; c++) {
      ysCopy.push((oldSnap[c + 1] as number[]).slice());
    }

    this.xs = new Float64Array(newCapacity);
    this.ys = Array.from({ length: this.channels }, () => new Float64Array(newCapacity));
    (this as { capacity: number }).capacity = newCapacity;
    this.writeIndex = 0;
    this.size = 0;

    this.scratchXs = new Array<number>(newCapacity).fill(0);
    this.scratchYs = Array.from(
      { length: this.channels },
      () => new Array<number>(newCapacity).fill(0)
    );
    this.scratchTuple = [this.scratchXs, ...this.scratchYs];

    const start = Math.max(0, xsCopy.length - newCapacity);
    for (let i = start; i < xsCopy.length; i++) {
      const vals: number[] = [];
      for (let c = 0; c < this.channels; c++) vals.push(ysCopy[c]![i] ?? 0);
      this.push(xsCopy[i]!, vals);
    }
  }
}

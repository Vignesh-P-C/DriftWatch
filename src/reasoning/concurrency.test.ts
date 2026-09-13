import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

describe("mapWithConcurrency", () => {
  it("never runs more than `limit` calls at once", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("returns results in the same order as input, despite concurrent completion", async () => {
    // Item 0 deliberately takes longest, to prove ordering isn't just luck.
    const delays = [30, 10, 20, 5];
    const results = await mapWithConcurrency(delays, 4, async (delay, i) => {
      await new Promise((r) => setTimeout(r, delay));
      return i;
    });

    const values = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    expect(values).toEqual([0, 1, 2, 3]);
  });

  it("isolates a failure to its own item — other items still succeed", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });

    expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  it("handles an empty input list without hanging", async () => {
    const results = await mapWithConcurrency([], 5, async () => "unused");
    expect(results).toEqual([]);
  });

  it("handles limit larger than the item count", async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (n) => n);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([1, 2]);
  });
});
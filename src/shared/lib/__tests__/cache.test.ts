import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryCache } from "../cache";

describe("MemoryCache", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for missing key", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves a value", () => {
    cache.set("key1", { data: 42 }, 10_000);
    expect(cache.get("key1")).toEqual({ data: 42 });
  });

  it("returns undefined after TTL expires", () => {
    cache.set("key2", "value", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("key2")).toBeUndefined();
  });

  it("returns value before TTL expires", () => {
    cache.set("key3", "value", 5_000);
    vi.advanceTimersByTime(4_999);
    expect(cache.get("key3")).toBe("value");
  });

  it("deletes a key", () => {
    cache.set("key4", "value", 10_000);
    cache.delete("key4");
    expect(cache.get("key4")).toBeUndefined();
  });

  it("deletes by prefix", () => {
    cache.set("area:1", "a", 10_000);
    cache.set("area:2", "b", 10_000);
    cache.set("terminal:1", "c", 10_000);
    cache.deleteByPrefix("area:");
    expect(cache.get("area:1")).toBeUndefined();
    expect(cache.get("area:2")).toBeUndefined();
    expect(cache.get("terminal:1")).toBe("c");
  });
});

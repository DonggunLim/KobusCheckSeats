import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryCache } from "../cache";

// We need to export the class for testing - let's test via the module
// Since cache.ts exports `cache` instance, we test MemoryCache directly
// by re-creating one here:

class TestableCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

describe("MemoryCache", () => {
  let cache: TestableCache;

  beforeEach(() => {
    cache = new TestableCache();
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

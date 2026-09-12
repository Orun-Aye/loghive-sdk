// tests/utils.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LogLevel } from "../src/types";
import {
  delay,
  getExponentialBackoffDelay,
  shouldLog,
  getElementSelector,
  sanitizeUrl,
  isInBrowser,
  extractErrorDetails,
  isNode,
  getEnvironmentInfo,
  getCurrentUrl,
  getReferrer,
  getTimestamp,
  safeStringify,
  isValidUUID,
  generateUUID,
  getSessionId,
  truncateString,
  debounce,
} from "../src/utils";

describe("Utils", () => {
  describe("delay", () => {
    it("should delay execution for specified milliseconds", async () => {
      const start = Date.now();
      await delay(100);
      const duration = Date.now() - start;

      // Allow 50ms tolerance
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
    });

    it("should handle zero delay", async () => {
      const start = Date.now();
      await delay(0);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe("getExponentialBackoffDelay", () => {
    it("should calculate exponential backoff correctly", () => {
      const initialDelay = 1000;

      const delay0 = getExponentialBackoffDelay(0, initialDelay);
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThan(1200); // 1000 + 10% jitter

      const delay1 = getExponentialBackoffDelay(1, initialDelay);
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThan(2400); // 2000 + 20% jitter

      const delay2 = getExponentialBackoffDelay(2, initialDelay);
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThan(4800); // 4000 + 40% jitter
    });

    it("should respect maximum delay cap", () => {
      const initialDelay = 1000;
      const maxDelay = 5000;

      const delay10 = getExponentialBackoffDelay(10, initialDelay, maxDelay);
      expect(delay10).toBeLessThanOrEqual(maxDelay);
    });

    it("should default max delay to 60000ms", () => {
      const initialDelay = 10000;

      const delay10 = getExponentialBackoffDelay(10, initialDelay);
      expect(delay10).toBeLessThanOrEqual(60000);
    });

    it("should add random jitter", () => {
      const delays = Array.from({ length: 10 }, () =>
        getExponentialBackoffDelay(1, 1000)
      );

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("shouldLog", () => {
    it("should allow logging at or above min level", () => {
      expect(shouldLog(LogLevel.ERROR, LogLevel.INFO)).toBe(true);
      expect(shouldLog(LogLevel.WARN, LogLevel.INFO)).toBe(true);
      expect(shouldLog(LogLevel.INFO, LogLevel.INFO)).toBe(true);
      expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(false);
      expect(shouldLog(LogLevel.TRACE, LogLevel.INFO)).toBe(false);
    });

    it("should handle all log levels correctly", () => {
      // TRACE is lowest
      expect(shouldLog(LogLevel.TRACE, LogLevel.TRACE)).toBe(true);
      expect(shouldLog(LogLevel.DEBUG, LogLevel.TRACE)).toBe(true);
      expect(shouldLog(LogLevel.INFO, LogLevel.TRACE)).toBe(true);

      // FATAL is highest
      expect(shouldLog(LogLevel.FATAL, LogLevel.FATAL)).toBe(true);
      expect(shouldLog(LogLevel.FATAL, LogLevel.ERROR)).toBe(true);
      expect(shouldLog(LogLevel.FATAL, LogLevel.WARN)).toBe(true);
    });

    it("should enforce strict level ordering", () => {
      expect(shouldLog(LogLevel.DEBUG, LogLevel.ERROR)).toBe(false);
      expect(shouldLog(LogLevel.INFO, LogLevel.WARN)).toBe(false);
      expect(shouldLog(LogLevel.WARN, LogLevel.ERROR)).toBe(false);
    });
  });

  describe("getElementSelector", () => {
    it("should prioritize ID selector", () => {
      const element = document.createElement("div");
      element.id = "test-id";
      element.className = "class1 class2";

      const selector = getElementSelector(element);
      expect(selector).toBe("#test-id");
    });

    it("should use class selector when no ID", () => {
      const element = document.createElement("div");
      element.className = "class1 class2";

      const selector = getElementSelector(element);
      expect(selector).toBe(".class1.class2");
    });

    it("should use tag name as fallback", () => {
      const element = document.createElement("button");

      const selector = getElementSelector(element);
      expect(selector).toBe("button");
    });

    it("should handle elements with empty className", () => {
      const element = document.createElement("span");
      element.className = "";

      const selector = getElementSelector(element);
      expect(selector).toBe("span");
    });

    it("should handle elements with whitespace-only className", () => {
      const element = document.createElement("div");
      element.className = "   ";

      const selector = getElementSelector(element);
      expect(selector).toBe("div");
    });
  });

  describe("sanitizeUrl", () => {
    it("should redact sensitive query parameters", () => {
      const url = "https://api.example.com/users?token=abc123&id=456";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toContain("token=[REDACTED]");
      expect(sanitized).not.toContain("abc123");
      expect(sanitized).toContain("id=456");
    });

    it("should redact multiple sensitive parameters", () => {
      const url =
        "https://example.com/api?key=secret1&password=secret2&data=public";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toContain("key=[REDACTED]");
      expect(sanitized).toContain("password=[REDACTED]");
      expect(sanitized).toContain("data=public");
      expect(sanitized).not.toContain("secret1");
      expect(sanitized).not.toContain("secret2");
    });

    it("should handle URLs without query parameters", () => {
      const url = "https://example.com/api/users";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe(url);
    });

    it("should handle invalid URLs gracefully", () => {
      const invalidUrl = "not-a-valid-url";
      const sanitized = sanitizeUrl(invalidUrl);

      expect(sanitized).toBe(invalidUrl);
    });

    it("should redact api_key parameter", () => {
      const url = "https://api.example.com/data?api_key=sk_live_FAKE";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toContain("api_key=[REDACTED]");
      expect(sanitized).not.toContain("sk_live_FAKE");
    });
  });

  describe("isInBrowser", () => {
    it("should return true in jsdom environment", () => {
      expect(isInBrowser()).toBe(true);
    });
  });

  describe("extractErrorDetails", () => {
    it("should extract details from Error objects", () => {
      const error = new Error("Test error");
      error.name = "TestError";

      const details = extractErrorDetails(error);
      expect(details.name).toBe("TestError");
      expect(details.message).toBe("Test error");
      expect(details.stack).toBeDefined();
    });

    it("should handle string errors", () => {
      const details = extractErrorDetails("Something went wrong");
      expect(details.name).toBe("StringError");
      expect(details.message).toBe("Something went wrong");
    });

    it("should handle null/undefined errors", () => {
      const nullDetails = extractErrorDetails(null);
      expect(nullDetails.name).toBe("UnknownError");
      expect(nullDetails.message).toBe("Unknown error occurred");

      const undefinedDetails = extractErrorDetails(undefined);
      expect(undefinedDetails.name).toBe("UnknownError");
    });

    it("should handle objects with error-like properties", () => {
      const errorLike = {
        name: "CustomError",
        message: "Custom error message",
        stack: "Error stack trace",
        lineNumber: 42,
        columnNumber: 10,
      };

      const details = extractErrorDetails(errorLike);
      expect(details.name).toBe("CustomError");
      expect(details.message).toBe("Custom error message");
      expect(details.stack).toBe("Error stack trace");
      expect(details.lineNumber).toBe(42);
      expect(details.columnNumber).toBe(10);
    });

    it("should handle errors without message", () => {
      const error = new Error();
      error.message = "";

      const details = extractErrorDetails(error);
      expect(details.name).toBe("Error");
      expect(details.message).toBe("Unknown error");
    });

    it("should handle numeric errors", () => {
      const details = extractErrorDetails(404);
      expect(details.name).toBe("UnknownError");
      expect(details.message).toBe("404");
    });
  });

  describe("isNode", () => {
    it("should detect Node.js environment correctly", () => {
      // In test environment, this depends on the environment
      const result = isNode();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getEnvironmentInfo", () => {
    it("should return environment information", () => {
      const info = getEnvironmentInfo();

      expect(info).toHaveProperty("runtime");
      expect(["browser", "node", "unknown"]).toContain(info.runtime);

      if (info.runtime === "browser") {
        expect(info.userAgent).toBeDefined();
      } else if (info.runtime === "node") {
        expect(info.version).toBeDefined();
      }
    });
  });

  describe("getCurrentUrl", () => {
    it("should return current URL in browser environment", () => {
      const url = getCurrentUrl();

      // In jsdom, should return a URL
      if (isInBrowser()) {
        expect(url).toBeDefined();
        expect(typeof url).toBe("string");
      }
    });
  });

  describe("getReferrer", () => {
    it("should return referrer in browser environment", () => {
      const referrer = getReferrer();

      // In jsdom, referrer might be undefined or empty string
      if (isInBrowser()) {
        expect(referrer === undefined || typeof referrer === "string").toBe(true);
      }
    });
  });

  describe("getTimestamp", () => {
    it("should return ISO formatted timestamp", () => {
      const timestamp = getTimestamp();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should return current time", () => {
      const before = Date.now();
      const timestamp = getTimestamp();
      const after = Date.now();

      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

  describe("safeStringify", () => {
    it("should stringify normal objects", () => {
      const obj = { name: "John", age: 30 };
      const result = safeStringify(obj);

      expect(result).toBe(JSON.stringify(obj));
    });

    it("should handle circular references", () => {
      const obj: any = { name: "Test" };
      obj.self = obj;

      const result = safeStringify(obj);
      expect(result).toContain("[Circular Reference]");
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should handle functions", () => {
      const obj = {
        data: "value",
        fn: function namedFunction() {},
        arrow: () => {},
      };

      const result = safeStringify(obj);
      expect(result).toContain("[Function: namedFunction]");
      expect(result).toContain("[Function: arrow]");
    });

    it("should handle undefined values", () => {
      const obj = { a: undefined, b: "value" };
      const result = safeStringify(obj);

      expect(result).toContain("[undefined]");
    });

    it("should respect space parameter", () => {
      const obj = { a: 1, b: 2 };
      const result = safeStringify(obj, 2);

      expect(result).toContain("\n");
      expect(result).toContain("  ");
    });

    it("should handle nested circular references", () => {
      const obj1: any = { name: "obj1" };
      const obj2: any = { name: "obj2", parent: obj1 };
      obj1.child = obj2;
      obj2.self = obj2;

      const result = safeStringify(obj1);
      expect(result).toContain("[Circular Reference]");
    });
  });

  describe("isValidUUID", () => {
    it("should validate correct UUIDs", () => {
      const validUUIDs = [
        "123e4567-e89b-12d3-a456-426614174000",
        "550e8400-e29b-41d4-a716-446655440000",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ];

      validUUIDs.forEach((uuid) => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it("should reject invalid UUIDs", () => {
      const invalidUUIDs = [
        "not-a-uuid",
        "123-456-789",
        "123e4567-e89b-12d3-a456", // Too short
        "123e4567-e89b-12d3-a456-426614174000-extra", // Too long
        "123e4567-e89b-62d3-a456-426614174000", // Invalid version (6)
        "123e4567-e89b-12d3-c456-426614174000", // Invalid variant (c)
      ];

      invalidUUIDs.forEach((uuid) => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });

    it("should be case insensitive", () => {
      const uuid = "123e4567-e89b-12d3-a456-426614174000";
      expect(isValidUUID(uuid.toUpperCase())).toBe(true);
      expect(isValidUUID(uuid.toLowerCase())).toBe(true);
    });
  });

  describe("truncateString", () => {
    it("should not truncate strings shorter than max length", () => {
      const str = "Short string";
      expect(truncateString(str, 20)).toBe(str);
    });

    it("should truncate long strings and add ellipsis", () => {
      const str = "This is a very long string that should be truncated";
      const result = truncateString(str, 20);

      expect(result.length).toBe(20);
      expect(result.endsWith("...")).toBe(true);
      expect(result).toBe("This is a very lo...");
    });

    it("should handle exact length match", () => {
      const str = "Exact";
      expect(truncateString(str, 5)).toBe(str);
    });

    it("should handle very short max length", () => {
      const str = "Test";
      const result = truncateString(str, 3);

      expect(result).toBe("...");
    });

    it("should handle empty string", () => {
      expect(truncateString("", 10)).toBe("");
    });
  });

  describe("debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should debounce function calls", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments correctly", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn("arg1", "arg2");

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should use last call's arguments", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn("first");
      debouncedFn("second");
      debouncedFn("third");

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("third");
    });

    it("should reset timer on subsequent calls", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);

      debouncedFn(); // Resets timer
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple debounce cycles", () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);

      debouncedFn();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("generateUUID", () => {
    it("should generate a valid UUID v4", () => {
      expect(isValidUUID(generateUUID())).toBe(true);
    });

    it("should generate a different value each call", () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateUUID()));
      expect(ids.size).toBe(50);
    });
  });

  describe("getSessionId", () => {
    it("should return a valid UUID", () => {
      expect(isValidUUID(getSessionId())).toBe(true);
    });

    it("should return the same id for the lifetime of the module", () => {
      expect(getSessionId()).toBe(getSessionId());
    });

    it("should never return an empty string", () => {
      expect(getSessionId().length).toBeGreaterThan(0);
    });
  });
});

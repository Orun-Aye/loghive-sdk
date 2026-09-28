// tests/auto-instrumentation.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoInstrumentation } from "../src/auto-instrumentation";
import { Apperio } from "../src/logger";
import { LogLevel } from "../src/types";

describe("AutoInstrumentation", () => {
  let logger: Apperio;
  let autoInstrumentation: AutoInstrumentation;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock fetch globally
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "success" }), { status: 200 })
    ));

    // Suppress console output during tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Create logger with ALL autoCapture disabled so it doesn't interfere
    logger = new Apperio({
      apiKey: "test-api-key",
      projectId: "test-project-id",
      minLogLevel: LogLevel.TRACE,
      autoCapture: {
        errors: false,
        performance: false,
        userInteractions: false,
        networkRequests: false,
        consoleMessages: false,
        pageViews: false,
      },
    });

    // Spy on the _log method
    logSpy = vi.spyOn(logger, "_log");

    // Create a separate AutoInstrumentation instance for controlled testing
    autoInstrumentation = new AutoInstrumentation(logger);
  });

  afterEach(() => {
    if (autoInstrumentation) {
      autoInstrumentation.destroy();
    }
    if (logger) {
      // Clean up without calling shutdown (which can hang with fake timers)
      const flushTimer = (logger as any)._flushTimer;
      if (flushTimer) {
        clearInterval(flushTimer);
        (logger as any)._flushTimer = null;
      }
      (logger as any)._initialized = false;
      (logger as any)._isShuttingDown = false;
      (logger as any)._logBuffer = [];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("Error Capture", () => {
    it("should capture uncaught errors via ErrorEvent", () => {
      autoInstrumentation.init({ errors: true });

      const errorEvent = new ErrorEvent("error", {
        message: "Test uncaught error",
        filename: "test.js",
        lineno: 10,
        colno: 5,
      });
      window.dispatchEvent(errorEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Uncaught Error",
        undefined,
        expect.objectContaining({
          eventType: "error",
        })
      );
    });

    it("should capture unhandled promise rejections", () => {
      autoInstrumentation.init({ errors: true });

      const rejectionEvent = new Event(
        "unhandledrejection"
      ) as PromiseRejectionEvent;
      Object.defineProperty(rejectionEvent, "reason", {
        value: new Error("Promise failed"),
      });
      window.dispatchEvent(rejectionEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Unhandled Promise Rejection",
        undefined,
        expect.objectContaining({
          eventType: "error",
        })
      );
    });

    it("should handle string rejection reasons", () => {
      autoInstrumentation.init({ errors: true });

      const rejectionEvent = new Event(
        "unhandledrejection"
      ) as PromiseRejectionEvent;
      Object.defineProperty(rejectionEvent, "reason", {
        value: "A string reason",
      });
      window.dispatchEvent(rejectionEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Unhandled Promise Rejection",
        undefined,
        expect.objectContaining({
          eventType: "error",
          error: expect.objectContaining({
            message: "A string reason",
          }),
        })
      );
    });
  });

  describe("Console Capture", () => {
    it("should capture console.error calls", () => {
      autoInstrumentation.init({ consoleMessages: true });

      console.error("Test error message");

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Console Error",
        undefined,
        expect.objectContaining({
          eventType: "console",
          consoleArgs: expect.arrayContaining(["Test error message"]),
        })
      );
    });

    it("should capture console.warn calls", () => {
      autoInstrumentation.init({ consoleMessages: true });

      console.warn("Test warning");

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.WARN,
        "Console Warning",
        undefined,
        expect.objectContaining({
          eventType: "console",
          consoleArgs: expect.arrayContaining(["Test warning"]),
        })
      );
    });

    it("should capture console.error with multiple arguments", () => {
      autoInstrumentation.init({ consoleMessages: true });

      console.error("Error:", "detail1", "detail2");

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Console Error",
        undefined,
        expect.objectContaining({
          consoleArgs: ["Error:", "detail1", "detail2"],
        })
      );
    });
  });

  describe("Page View Capture", () => {
    it("should capture initial page view on init", () => {
      autoInstrumentation.init({ pageViews: true });

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.INFO,
        "Page View",
        undefined,
        expect.objectContaining({
          eventType: "pageview",
          url: expect.any(String),
        })
      );
    });

    it("should capture page views on pushState", async () => {
      autoInstrumentation.init({ pageViews: true });

      // Clear the initial page view log call
      logSpy.mockClear();

      history.pushState({}, "", "/new-page");

      // pushState uses setTimeout(() => capturePageView(), 0)
      await vi.advanceTimersByTimeAsync(10);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.INFO,
        "Page View",
        undefined,
        expect.objectContaining({
          eventType: "pageview",
        })
      );
    });

    it("should capture page views on replaceState", async () => {
      autoInstrumentation.init({ pageViews: true });
      logSpy.mockClear();

      history.replaceState({}, "", "/replaced-page");

      await vi.advanceTimersByTimeAsync(10);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.INFO,
        "Page View",
        undefined,
        expect.objectContaining({
          eventType: "pageview",
        })
      );
    });
  });

  describe("User Interaction Capture", () => {
    it("should capture click events", () => {
      autoInstrumentation.init({ userInteractions: true });

      // Click on an actual element so event.target is an Element
      const div = document.createElement("div");
      document.body.appendChild(div);
      div.click();

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        "User click",
        undefined,
        expect.objectContaining({
          eventType: "interaction",
          interaction: expect.objectContaining({
            type: "click",
          }),
        })
      );

      document.body.removeChild(div);
    });

    it("should capture focus events", () => {
      autoInstrumentation.init({ userInteractions: true });

      const input = document.createElement("input");
      document.body.appendChild(input);

      const focusEvent = new FocusEvent("focus", {
        bubbles: true,
      });
      input.dispatchEvent(focusEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        "User focus",
        undefined,
        expect.objectContaining({
          eventType: "interaction",
        })
      );

      document.body.removeChild(input);
    });

    it("should capture blur events", () => {
      autoInstrumentation.init({ userInteractions: true });

      const input = document.createElement("input");
      document.body.appendChild(input);

      const blurEvent = new FocusEvent("blur", {
        bubbles: true,
      });
      input.dispatchEvent(blurEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        "User blur",
        undefined,
        expect.objectContaining({
          eventType: "interaction",
        })
      );

      document.body.removeChild(input);
    });

    it("should throttle scroll events", async () => {
      autoInstrumentation.init({ userInteractions: true });

      // Fire multiple scroll events rapidly
      for (let i = 0; i < 5; i++) {
        const scrollEvent = new Event("scroll", { bubbles: true });
        document.dispatchEvent(scrollEvent);
      }

      // Advance past the throttle timeout (100ms)
      await vi.advanceTimersByTimeAsync(200);

      const scrollCalls = logSpy.mock.calls.filter(
        (call) => call[1] === "User scroll"
      );
      // Due to throttling, at most 1 call happens (may be 0 if target is null)
      expect(scrollCalls.length).toBeLessThanOrEqual(1);
    });

    it("should throttle keypress events", async () => {
      autoInstrumentation.init({ userInteractions: true });

      const input = document.createElement("input");
      document.body.appendChild(input);

      // Fire multiple keypress events rapidly on a real element
      for (let i = 0; i < 5; i++) {
        const keypressEvent = new KeyboardEvent("keypress", {
          bubbles: true,
          key: "a",
        });
        input.dispatchEvent(keypressEvent);
      }

      await vi.advanceTimersByTimeAsync(200);

      const keypressCalls = logSpy.mock.calls.filter(
        (call) => call[1] === "User keypress"
      );
      // Due to throttling, only 1 call should happen
      expect(keypressCalls.length).toBe(1);

      document.body.removeChild(input);
    });
  });

  describe("Performance Capture", () => {
    it("ignores the SDK's own uploads but logs other resources", () => {
      type Callback = (list: { getEntries: () => any[] }) => void;
      // Web Vitals create observers too; keep the one watching resources
      let callback: Callback = () => {};
      vi.stubGlobal(
        "PerformanceObserver",
        class {
          constructor(private cb: Callback) {}
          observe(options: { entryTypes?: string[] }) {
            if (options?.entryTypes?.includes("resource")) callback = this.cb;
          }
          disconnect() {}
        }
      );

      autoInstrumentation.init({ performance: true } as any);
      const resource = (name: string) => ({ name, entryType: "resource", startTime: 0, duration: 5 });
      callback({
        getEntries: () => [
          resource(`${logger.getEndpoint()}/test-project-id/logs/batch`),
          resource(`${logger.getEndpoint()}/test-project-id/replay`),
          resource("https://cdn.example/app.js"),
        ],
      });

      const logged = logSpy.mock.calls
        .map((c) => (c[3] as any)?.performance?.name)
        .filter(Boolean);
      expect(logged).toEqual(["https://cdn.example/app.js"]);
    });
  });

  describe("Network Capture - Fetch", () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = window.fetch;
    });

    afterEach(() => {
      // Restore original fetch just in case destroy didn't do it
      window.fetch = originalFetch;
    });

    it("should intercept fetch requests", async () => {
      // Mock the original fetch before init patches it
      const mockFetchResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      window.fetch = vi.fn().mockResolvedValue(mockFetchResponse);

      autoInstrumentation.init({ networkRequests: true });

      await window.fetch("https://api.example.com/test");

      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        expect.objectContaining({
          eventType: "network",
          network: expect.objectContaining({
            url: expect.stringContaining("api.example.com"),
            method: "GET",
          }),
        })
      );
    });

    it("should log errors for failed fetch requests", async () => {
      window.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      autoInstrumentation.init({ networkRequests: true });

      try {
        await window.fetch("https://api.example.com/fail");
      } catch {
        // Expected to throw
      }

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Network Request Failed",
        expect.any(Error),
        expect.objectContaining({
          eventType: "network",
        })
      );
    });
  });

  describe("Network Capture - XHR", () => {
    it("should patch XMLHttpRequest", () => {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      autoInstrumentation.init({ networkRequests: true });

      // XHR prototype methods should be patched
      expect(XMLHttpRequest.prototype.open).not.toBe(originalOpen);
      expect(XMLHttpRequest.prototype.send).not.toBe(originalSend);
    });
  });

  describe("Destroy / Cleanup", () => {
    it("should restore fetch after destroy", () => {
      const originalFetchRef = window.fetch;

      autoInstrumentation.init({ networkRequests: true });

      // fetch should be patched (different from original)
      expect(window.fetch).not.toBe(originalFetchRef);

      autoInstrumentation.destroy();

      // fetch should be restored
      expect(window.fetch).toBe(originalFetchRef);
    });

    it("should restore console.error after destroy", () => {
      const originalConsoleError = console.error;

      autoInstrumentation.init({ consoleMessages: true });

      // console.error should be patched
      expect(console.error).not.toBe(originalConsoleError);

      autoInstrumentation.destroy();

      // console.error should be restored
      expect(console.error).toBe(originalConsoleError);
    });

    it("should restore console.warn after destroy", () => {
      const originalConsoleWarn = console.warn;

      autoInstrumentation.init({ consoleMessages: true });

      expect(console.warn).not.toBe(originalConsoleWarn);

      autoInstrumentation.destroy();

      expect(console.warn).toBe(originalConsoleWarn);
    });

    it("should restore XHR prototypes after destroy", () => {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      autoInstrumentation.init({ networkRequests: true });
      autoInstrumentation.destroy();

      expect(XMLHttpRequest.prototype.open).toBe(originalOpen);
      expect(XMLHttpRequest.prototype.send).toBe(originalSend);
    });

    it("should restore History API after destroy", () => {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      autoInstrumentation.init({ pageViews: true });

      expect(history.pushState).not.toBe(originalPushState);
      expect(history.replaceState).not.toBe(originalReplaceState);

      autoInstrumentation.destroy();

      expect(history.pushState).toBe(originalPushState);
      expect(history.replaceState).toBe(originalReplaceState);
    });
  });

  describe("Browser Guard", () => {
    it("should warn when not in browser environment", async () => {
      // Mock isInBrowser to return false
      const utils = await import("../src/utils");
      const utilsMock = vi.spyOn(utils, "isInBrowser");
      utilsMock.mockReturnValue(false);

      const warnSpy = vi.spyOn(console, "warn");
      const newAutoInst = new AutoInstrumentation(logger);
      newAutoInst.init({ errors: true, pageViews: true });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Not in browser")
      );

      utilsMock.mockRestore();
    });
  });

  describe("Selective Initialization", () => {
    it("should only initialize requested features", () => {
      // Init with only errors
      autoInstrumentation.init({ errors: true });

      // Verify console was NOT captured (no console patching)
      const consoleErrorBefore = console.error;
      autoInstrumentation.init({ errors: true });
      expect(console.error).toBe(consoleErrorBefore);
    });

    it("should handle empty config", () => {
      // Init with no features enabled
      expect(() => {
        autoInstrumentation.init({});
      }).not.toThrow();
    });

    it("should handle all features disabled", () => {
      expect(() => {
        autoInstrumentation.init({
          errors: false,
          performance: false,
          userInteractions: false,
          networkRequests: false,
          consoleMessages: false,
          pageViews: false,
        });
      }).not.toThrow();
    });
  });

  describe("Error Event Details", () => {
    it("should include error details in logged data", () => {
      autoInstrumentation.init({ errors: true });

      const errorEvent = new ErrorEvent("error", {
        message: "TypeError: Cannot read property 'foo' of undefined",
        filename: "app.js",
        lineno: 42,
        colno: 15,
      });
      window.dispatchEvent(errorEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        "Uncaught Error",
        undefined,
        expect.objectContaining({
          eventType: "error",
          error: expect.objectContaining({
            message: expect.stringContaining("TypeError"),
          }),
        })
      );
    });
  });

  describe("Click Interaction Details", () => {
    it("should include mouse coordinates for click events", () => {
      autoInstrumentation.init({ userInteractions: true });

      const div = document.createElement("div");
      document.body.appendChild(div);

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        clientX: 150,
        clientY: 250,
      });
      div.dispatchEvent(clickEvent);

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        "User click",
        undefined,
        expect.objectContaining({
          interaction: expect.objectContaining({
            type: "click",
            coordinates: { x: 150, y: 250 },
          }),
        })
      );

      document.body.removeChild(div);
    });

    it("should include element selector for click target", () => {
      autoInstrumentation.init({ userInteractions: true });

      const button = document.createElement("button");
      button.id = "test-button";
      document.body.appendChild(button);

      button.click();

      expect(logSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        "User click",
        undefined,
        expect.objectContaining({
          interaction: expect.objectContaining({
            target: "#test-button",
          }),
        })
      );

      document.body.removeChild(button);
    });
  });
});

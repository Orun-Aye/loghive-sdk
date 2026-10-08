// tests/logger.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Apperio } from "../src/logger";
import { LogLevel } from "../src/types";

describe("Apperio Logger", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let logger: Apperio;

  beforeEach(() => {
    vi.useFakeTimers();

    // Setup fetch mock
    mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "success" }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    // Suppress console warnings during tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (logger) {
      // Clear the flush timer without calling flush (which may hang with fake timers)
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

  describe("Initialization", () => {
    it("should initialize with required config", () => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
      });

      expect(logger.isInitialized()).toBe(true);
    });

    it("should throw error if apiKey is missing", () => {
      expect(() => {
        new Apperio({
          projectId: "test-project-id",
        } as any);
      }).toThrow("API Key is required");
    });

    it("should throw error if projectId is missing", () => {
      expect(() => {
        new Apperio({
          apiKey: "test-api-key",
        } as any);
      }).toThrow("Project ID is required");
    });

    it("should apply default configuration values", () => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
      });

      const config = (logger as any)._config;

      expect(config.endpoint).toBe("https://apperioserver.onrender.com/api/v1");
      expect(config.minLogLevel).toBe(LogLevel.INFO);
      expect(config.batchSize).toBe(10);
      expect(config.flushIntervalMs).toBe(5000);
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelayMs).toBe(1000);
      expect(config.environment).toBe("development");
      expect(config.serviceName).toBe("unknown-service");
    });

    it("should allow custom configuration", () => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        endpoint: "https://custom.endpoint.com",
        minLogLevel: LogLevel.DEBUG,
        batchSize: 20,
        flushIntervalMs: 10000,
        environment: "production",
        serviceName: "my-service",
        serviceVersion: "2.0.0",
      });

      const config = (logger as any)._config;

      expect(config.endpoint).toBe("https://custom.endpoint.com");
      expect(config.minLogLevel).toBe(LogLevel.DEBUG);
      expect(config.batchSize).toBe(20);
      expect(config.flushIntervalMs).toBe(10000);
      expect(config.environment).toBe("production");
      expect(config.serviceName).toBe("my-service");
      expect(config.serviceVersion).toBe("2.0.0");
    });

    it("should merge autoCapture config with defaults", () => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        autoCapture: {
          errors: false,
          pageViews: false,
        },
      });

      const config = (logger as any)._config;

      expect(config.autoCapture.errors).toBe(false);
      expect(config.autoCapture.performance).toBe(true); // Default
      expect(config.autoCapture.pageViews).toBe(false);
      expect(config.autoCapture.networkRequests).toBe(true); // Default
    });

    it("should prevent double initialization", () => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
      });

      const warnSpy = vi.spyOn(console, "warn");
      logger.init();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Already initialized")
      );
    });
  });

  describe("Log Methods", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        minLogLevel: LogLevel.TRACE, // Allow all levels
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should create trace log", () => {
      logger.trace("Trace message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.TRACE);
      expect(buffer[0].message).toBe("Trace message");
    });

    it("should create debug log", () => {
      logger.debug("Debug message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.DEBUG);
      expect(buffer[0].message).toBe("Debug message");
    });

    it("should create info log", () => {
      logger.info("Info message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.INFO);
      expect(buffer[0].message).toBe("Info message");
    });

    it("should create warn log", () => {
      logger.warn("Warning message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.WARN);
      expect(buffer[0].message).toBe("Warning message");
    });

    it("should create error log", () => {
      logger.error("Error message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.ERROR);
      expect(buffer[0].message).toBe("Error message");
    });

    it("should create fatal log", () => {
      logger.fatal("Fatal message");
      const buffer = (logger as any)._logBuffer;

      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.FATAL);
      expect(buffer[0].message).toBe("Fatal message");
    });

    it("should respect minLogLevel", () => {
      const restrictiveLogger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        minLogLevel: LogLevel.WARN,
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });

      restrictiveLogger.trace("Should not log");
      restrictiveLogger.debug("Should not log");
      restrictiveLogger.info("Should not log");
      restrictiveLogger.warn("Should log");
      restrictiveLogger.error("Should log");

      const buffer = (restrictiveLogger as any)._logBuffer;
      expect(buffer).toHaveLength(2);
      expect(buffer[0].level).toBe(LogLevel.WARN);
      expect(buffer[1].level).toBe(LogLevel.ERROR);

      restrictiveLogger.shutdown();
    });

    it("should include data in log entry", () => {
      logger.info("Message with data", { userId: "123", action: "login" });
      const buffer = (logger as any)._logBuffer;

      expect(buffer[0].data).toEqual({ userId: "123", action: "login" });
    });

    it("should include all required fields in log entry", () => {
      logger.info("Test message");
      const buffer = (logger as any)._logBuffer;
      const logEntry = buffer[0];

      expect(logEntry).toHaveProperty("projectId", "test-project-id");
      expect(logEntry).toHaveProperty("timestamp");
      expect(logEntry).toHaveProperty("level", LogLevel.INFO);
      expect(logEntry).toHaveProperty("message", "Test message");
      expect(logEntry).toHaveProperty("service");
      expect(logEntry).toHaveProperty("environment");
    });
  });

  describe("Batching", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        batchSize: 5,
        flushIntervalMs: 10000,
        // Decided in code, so no dashboard-setting request joins the fetch count
        replay: { enabled: false },
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should flush when buffer reaches batchSize", async () => {
      // Log 5 messages (batchSize)
      for (let i = 0; i < 5; i++) {
        logger.info(`Message ${i}`);
      }

      // Should flush immediately
      await vi.advanceTimersByTimeAsync(100);

      // One batch POST containing all 5 logs
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect((logger as any)._logBuffer).toHaveLength(0);
    });

    it("should flush on timer interval", async () => {
      logger.info("Message 1");
      logger.info("Message 2");

      // Buffer has 2 messages, not at batchSize yet
      expect((logger as any)._logBuffer).toHaveLength(2);

      // Advance time by flushIntervalMs
      await vi.advanceTimersByTimeAsync(10000);

      expect(mockFetch).toHaveBeenCalled();
      expect((logger as any)._logBuffer).toHaveLength(0);
    });

    it("should not exceed MAX_BUFFER_SIZE", () => {
      const maxSize = (Apperio as any).MAX_BUFFER_SIZE;

      // Try to log more than MAX_BUFFER_SIZE
      for (let i = 0; i < maxSize + 100; i++) {
        logger.info(`Message ${i}`);
      }

      const buffer = (logger as any)._logBuffer;
      expect(buffer.length).toBeLessThanOrEqual(maxSize);
    });

    it("should drop oldest logs when buffer is full", () => {
      const maxSize = (Apperio as any).MAX_BUFFER_SIZE;

      // Fill buffer to max
      for (let i = 0; i < maxSize + 10; i++) {
        logger.info(`Message ${i}`);
      }

      const buffer = (logger as any)._logBuffer;

      // Should keep newest messages
      expect(buffer[buffer.length - 1].message).toContain(
        `Message ${maxSize + 9}`
      );
    });
  });

  describe("Context Management", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should set context", () => {
      logger.setContext({ userId: "123", sessionId: "abc" });
      const context = logger.getContext();

      expect(context).toMatchObject({ userId: "123", sessionId: "abc" });
    });

    it("should merge context", () => {
      logger.setContext({ userId: "123" });
      logger.setContext({ sessionId: "abc" });

      const context = logger.getContext();
      expect(context).toMatchObject({ userId: "123", sessionId: "abc" });
    });

    it("should include context in every log", () => {
      logger.setContext({ userId: "123", env: "prod" });
      logger.info("Test message");

      const buffer = (logger as any)._logBuffer;
      expect(buffer[0].context).toMatchObject({ userId: "123", env: "prod" });
    });

    it("should allow overriding context keys", () => {
      logger.setContext({ userId: "123" });
      logger.setContext({ userId: "456" }); // Override

      const context = logger.getContext();
      expect(context.userId).toBe("456");
    });

    it("should clear context", () => {
      logger.setContext({ userId: "123", sessionId: "abc" });
      logger.clearContext();

      const context = logger.getContext();
      expect(context).toEqual({});
    });
  });

  describe("Retry Logic", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        batchSize: 1,
        maxRetries: 3,
        retryDelayMs: 1000,
        // Decided in code, so no dashboard-setting request joins the fetch count
        replay: { enabled: false },
        flushIntervalMs: 999999, // Very high to prevent interval from interfering
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should retry on network failure", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "success" }), { status: 200 })
        );

      logger.info("Test message");

      await vi.advanceTimersByTimeAsync(30000);

      // Should have retried and eventually succeeded
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should give up after maxRetries", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      logger.info("Test message");

      await vi.advanceTimersByTimeAsync(30000);

      // Initial attempt + 3 retries = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should re-queue failed logs at buffer front", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      logger.info("First message");

      await vi.advanceTimersByTimeAsync(30000);

      const buffer = (logger as any)._logBuffer;

      // Failed logs should be back in buffer
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("Shutdown", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should flush remaining logs on shutdown", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("Message 1");
      logger.info("Message 2");

      // Verify buffer has 2 messages before flush
      expect((logger as any)._logBuffer).toHaveLength(2);

      // Flush via timer advancement (the flush interval)
      await vi.advanceTimersByTimeAsync(10000);

      expect(mockFetch).toHaveBeenCalled();
      expect((logger as any)._logBuffer).toHaveLength(0);
    });

    it("should clear flush timer on shutdown", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.useRealTimers();
      await logger.shutdown();

      expect((logger as any)._flushTimer).toBeNull();
    });

    it("should mark as not initialized after shutdown", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      expect(logger.isInitialized()).toBe(true);

      vi.useRealTimers();
      await logger.shutdown();

      expect(logger.isInitialized()).toBe(false);
    });

    it("should remove event listeners on shutdown", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      vi.useRealTimers();
      await logger.shutdown();

      expect(removeEventListenerSpy).toHaveBeenCalled();
    });
  });

  describe("captureException", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should capture Error objects", () => {
      const error = new Error("Test error");
      logger.captureException(error);

      const buffer = (logger as any)._logBuffer;
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.ERROR);
      expect(buffer[0].error).toBeDefined();
      expect(buffer[0].error.message).toBe("Test error");
      expect(buffer[0].error.stack).toBeDefined();
    });

    it("should capture error with additional context", () => {
      const error = new Error("Test error");
      logger.captureException(error, { userId: "123", component: "Login" });

      const buffer = (logger as any)._logBuffer;
      expect(buffer[0].context).toMatchObject({
        userId: "123",
        component: "Login",
      });
    });

    it("should extract error details correctly", () => {
      const error = new Error("Test error");
      error.name = "ValidationError";

      logger.captureException(error);

      const buffer = (logger as any)._logBuffer;
      expect(buffer[0].error.name).toBe("ValidationError");
      expect(buffer[0].error.message).toBe("Test error");
    });
  });

  describe("captureMessage", () => {
    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        autoCapture: {
          errors: false,
          performance: false,
          networkRequests: false,
          pageViews: false,
        },
      });
    });

    it("should capture message at INFO level by default", () => {
      logger.captureMessage("Important event");

      const buffer = (logger as any)._logBuffer;
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.INFO);
      expect(buffer[0].message).toBe("Important event");
    });

    it("should capture message at specified level", () => {
      logger.captureMessage("Warning event", LogLevel.WARN);

      const buffer = (logger as any)._logBuffer;
      expect(buffer[0].level).toBe(LogLevel.WARN);
    });

    it("should include context", () => {
      logger.setContext({ userId: "123" });
      logger.captureMessage("User action");

      const buffer = (logger as any)._logBuffer;
      expect(buffer[0].context).toMatchObject({ userId: "123" });
    });
  });
describe("Exit flush", () => {
    const batchCalls = () =>
      mockFetch.mock.calls.filter(([url]) => String(url).includes("/logs/batch"));
    const sentLogs = (call: any[]) => JSON.parse(call[1].body).logs;

    beforeEach(() => {
      logger = new Apperio({
        apiKey: "test-api-key",
        projectId: "test-project-id",
        batchSize: 1000,
        autoCapture: { errors: false, performance: false, networkRequests: false, pageViews: false },
      });
    });

    it("sends the buffer with keepalive when the page is hidden away", () => {
      logger.info("last words");
      window.dispatchEvent(new Event("pagehide"));

      const calls = batchCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0][1].keepalive).toBe(true);
      expect(sentLogs(calls[0]).map((l: any) => l.message)).toEqual(["last words"]);
      expect((logger as any)._logBuffer).toHaveLength(0);
    });

    it("also sends when the tab becomes hidden (mobile)", () => {
      logger.info("backgrounded");
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

      expect(batchCalls()).toHaveLength(1);
      expect(batchCalls()[0][1].keepalive).toBe(true);
    });

    it("sends even while a timed flush is in flight", () => {
      (logger as any)._isFlushing = true;
      logger.info("queued behind a flush");
      window.dispatchEvent(new Event("pagehide"));

      expect(batchCalls()).toHaveLength(1);
    });

    it("keeps the keepalive request under budget and sends the rest plainly", () => {
      const big = "x".repeat(2000);
      for (let i = 0; i < 40; i++) logger.info("log " + i, { big });
      window.dispatchEvent(new Event("pagehide"));

      const calls = batchCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0][1].keepalive).toBe(true);
      expect(new TextEncoder().encode(calls[0][1].body).length).toBeLessThanOrEqual(40 * 1024);
      expect(calls[1][1].keepalive).toBe(false);
      expect(sentLogs(calls[0]).length + sentLogs(calls[1]).length).toBe(40);
    });

    it("does nothing with an empty buffer", () => {
      window.dispatchEvent(new Event("pagehide"));
      expect(batchCalls()).toHaveLength(0);
    });

    it("stops listening after shutdown", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.useRealTimers();
      await logger.shutdown();
      mockFetch.mockClear();

      (logger as any)._logBuffer = [{ message: "late" }];
      window.dispatchEvent(new Event("pagehide"));
      expect(batchCalls()).toHaveLength(0);
    });
  });
});

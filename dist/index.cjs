'use strict';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/types.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2["TRACE"] = "trace";
  LogLevel2["DEBUG"] = "debug";
  LogLevel2["INFO"] = "info";
  LogLevel2["WARN"] = "warn";
  LogLevel2["ERROR"] = "error";
  LogLevel2["FATAL"] = "fatal";
  return LogLevel2;
})(LogLevel || {});

// src/utils.ts
var delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
var getExponentialBackoffDelay = (retryCount, initialDelayMs, maxDelayMs = 6e4) => {
  const baseDelay = initialDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * baseDelay * 0.1;
  return Math.min(baseDelay + jitter, maxDelayMs);
};
var shouldLog = (currentLevel, minLevel) => {
  const levelOrder = {
    ["trace" /* TRACE */]: 0,
    ["debug" /* DEBUG */]: 1,
    ["info" /* INFO */]: 2,
    ["warn" /* WARN */]: 3,
    ["error" /* ERROR */]: 4,
    ["fatal" /* FATAL */]: 5
  };
  return levelOrder[currentLevel] >= levelOrder[minLevel];
};
var getElementSelector = (element) => {
  if (element.id) {
    return `#${element.id}`;
  }
  if (element.className) {
    const classes = element.className.toString().split(" ").filter((c) => c);
    if (classes.length > 0) {
      return `.${classes.join(".")}`;
    }
  }
  return element.tagName.toLowerCase();
};
var sanitizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const sensitiveParams = ["token", "key", "password", "secret", "api_key"];
    sensitiveParams.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, "[REDACTED]");
      }
    });
    return urlObj.toString().replace(/%5B/g, "[").replace(/%5D/g, "]");
  } catch {
    return url;
  }
};
var isInBrowser = () => {
  return typeof window !== "undefined" && typeof document !== "undefined";
};
function extractErrorDetails(error) {
  if (!error) {
    return {
      name: "UnknownError",
      message: "Unknown error occurred"
    };
  }
  if (typeof error === "string") {
    return {
      name: "StringError",
      message: error
    };
  }
  if (error instanceof Error) {
    const result = {
      name: error.name || "Error",
      message: error.message || "Unknown error"
    };
    if (error.stack) {
      result.stack = error.stack;
    }
    return result;
  }
  if (typeof ErrorEvent !== "undefined" && error instanceof ErrorEvent) {
    return {
      name: "ErrorEvent",
      message: error.message || "Unknown error event",
      url: error.filename,
      lineNumber: error.lineno,
      columnNumber: error.colno
    };
  }
  if (typeof error === "object") {
    return {
      name: error.name || error.constructor?.name || "ObjectError",
      message: error.message || error.toString() || "Unknown object error",
      stack: error.stack,
      url: error.url || error.filename,
      lineNumber: error.lineNumber || error.lineno,
      columnNumber: error.columnNumber || error.colno
    };
  }
  return {
    name: "UnknownError",
    message: String(error)
  };
}
function safeStringify(obj, space) {
  const seen = /* @__PURE__ */ new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular Reference]";
      }
      seen.add(value);
    }
    if (typeof value === "function") {
      return `[Function: ${value.name || "anonymous"}]`;
    }
    if (value === void 0) {
      return "[undefined]";
    }
    return value;
  }, space);
}
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var _sessionId = null;
function getSessionId() {
  if (_sessionId === null) {
    _sessionId = generateUUID();
  }
  return _sessionId;
}

// src/breadcrumb-manager.ts
var BreadcrumbManager = class {
  constructor(maxBreadcrumbs = 50) {
    this.breadcrumbs = [];
    this.maxBreadcrumbs = maxBreadcrumbs;
  }
  /**
   * Add a breadcrumb to the trail.
   * If the trail exceeds maxBreadcrumbs, the oldest entry is removed.
   */
  add(breadcrumb) {
    this.breadcrumbs.push(breadcrumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }
  /**
   * Returns a shallow copy of all breadcrumbs.
   */
  getAll() {
    return [...this.breadcrumbs];
  }
  /**
   * Clears all breadcrumbs.
   */
  clear() {
    this.breadcrumbs = [];
  }
  /**
   * Captures a snapshot of the current browser environment.
   * Gracefully handles missing APIs (e.g., navigator.connection, performance.memory).
   */
  captureEnvironment() {
    const snapshot = {
      url: typeof window !== "undefined" ? window.location.href : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      viewport: {
        width: typeof window !== "undefined" ? window.innerWidth : 0,
        height: typeof window !== "undefined" ? window.innerHeight : 0
      },
      scrollPosition: {
        x: typeof window !== "undefined" ? window.scrollX : 0,
        y: typeof window !== "undefined" ? window.scrollY : 0
      },
      networkState: {
        online: typeof navigator !== "undefined" ? navigator.onLine : true
      },
      timestamp: Date.now()
    };
    if (typeof navigator !== "undefined" && navigator.connection) {
      snapshot.networkState.connectionType = navigator.connection.effectiveType;
    }
    if (typeof performance !== "undefined" && performance.memory) {
      const mem = performance.memory;
      snapshot.memory = {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit
      };
    }
    return snapshot;
  }
};

// src/auto-instrumentation.ts
var AutoInstrumentation = class {
  constructor(logger) {
    this.webVitalObservers = [];
    this.logger = logger;
    this.breadcrumbManager = new BreadcrumbManager();
  }
  init(config) {
    if (!isInBrowser()) {
      console.warn(
        "AutoInstrumentation: Not in browser environment, skipping initialization"
      );
      return;
    }
    if (typeof window === "undefined") {
      console.warn("AutoInstrumentation: Window object not available");
    }
    if (config.errors) {
      this.setupErrorCapture();
    }
    if (config.performance) {
      this.setupPerformanceCapture();
      this.setupWebVitalsCapture();
    }
    if (config.userInteractions) {
      this.setupUserInteractionCapture();
    }
    if (config.networkRequests) {
      this.setupNetworkCapture();
    }
    if (config.consoleMessages) {
      this.setupConsoleCapture();
    }
    if (config.pageViews) {
      this.setupPageViewCapture();
    }
  }
  setupErrorCapture() {
    this._errorHandler = (event) => {
      const errorDetails = extractErrorDetails(event);
      this.logger._log("error" /* ERROR */, "Uncaught Error", void 0, {
        eventType: "error",
        error: errorDetails,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        breadcrumbs: this.breadcrumbManager.getAll(),
        environment: this.breadcrumbManager.captureEnvironment()
      });
    };
    window.addEventListener("error", this._errorHandler);
    this._rejectionHandler = (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      const errorDetails = extractErrorDetails(error);
      this.logger._log(
        "error" /* ERROR */,
        "Unhandled Promise Rejection",
        void 0,
        {
          eventType: "error",
          error: errorDetails,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
          breadcrumbs: this.breadcrumbManager.getAll(),
          environment: this.breadcrumbManager.captureEnvironment()
        }
      );
    };
    window.addEventListener("unhandledrejection", this._rejectionHandler);
  }
  setupPerformanceCapture() {
    if (!("PerformanceObserver" in window)) {
      console.warn("AutoInstrumentation: PerformanceObserver not supported");
      return;
    }
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const perfEntry = {
            name: entry.name,
            type: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration
          };
          if ("transferSize" in entry) {
            perfEntry.size = entry.transferSize;
          }
          let level = "debug" /* DEBUG */;
          let message = "Performance Entry";
          if (entry.entryType === "navigation") {
            if (entry.duration > 3e3) {
              level = "warn" /* WARN */;
              message = "Slow Page Load";
            } else if (entry.duration > 1e3) {
              level = "info" /* INFO */;
              message = "Page Load Performance";
            }
          } else if (entry.entryType === "resource") {
            if (entry.duration > 3e3) {
              level = "warn" /* WARN */;
              message = "Slow Resource Load";
            } else if (entry.name.includes(".css") || entry.name.includes(".js")) {
              if (entry.duration > 1e3) {
                level = "info" /* INFO */;
                message = "Critical Resource Load";
              }
            }
          } else if (entry.entryType === "paint") {
            if (entry.duration > 2e3) {
              level = "warn" /* WARN */;
              message = "Slow Paint";
            } else if (entry.duration > 1e3) {
              level = "info" /* INFO */;
              message = "Paint Performance";
            }
          }
          this.logger._log(level, message, void 0, {
            eventType: "performance",
            performance: perfEntry,
            url: window.location.href,
            timestamp: Date.now()
          });
        });
      });
      this.performanceObserver.observe({
        entryTypes: ["navigation", "resource", "measure", "paint"]
      });
    } catch (error) {
      console.warn(
        "AutoInstrumentation: Failed to setup performance observer:",
        error
      );
    }
  }
  setupUserInteractionCapture() {
    const captureInteraction = (type, event) => {
      const target = event.target;
      if (!target) return;
      const interaction = {
        type,
        target: getElementSelector(target),
        timestamp: Date.now()
      };
      if (event instanceof MouseEvent) {
        interaction.coordinates = { x: event.clientX, y: event.clientY };
      }
      let level = "debug" /* DEBUG */;
      if (type === "scroll" || type === "keypress") {
        level = "trace" /* TRACE */;
      }
      this.logger._log(level, `User ${type}`, void 0, {
        eventType: "interaction",
        interaction,
        url: window.location.href,
        timestamp: Date.now()
      });
    };
    this._clickHandler = (event) => {
      const target = event.target;
      if (target) {
        this.breadcrumbManager.add({
          timestamp: Date.now(),
          category: "ui",
          message: "User click",
          level: "debug",
          data: {
            target: getElementSelector(target),
            coordinates: { x: event.clientX, y: event.clientY }
          }
        });
      }
      captureInteraction("click", event);
    };
    document.addEventListener("click", this._clickHandler, true);
    let scrollTimeout;
    this._scrollHandler = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        captureInteraction("scroll", new Event("scroll"));
      }, 100);
    };
    document.addEventListener("scroll", this._scrollHandler, true);
    this._focusHandler = (event) => captureInteraction("focus", event);
    this._blurHandler = (event) => captureInteraction("blur", event);
    document.addEventListener("focus", this._focusHandler, true);
    document.addEventListener("blur", this._blurHandler, true);
    let keypressTimeout;
    this._keypressHandler = (event) => {
      clearTimeout(keypressTimeout);
      keypressTimeout = window.setTimeout(() => {
        captureInteraction("keypress", event);
      }, 100);
    };
    document.addEventListener("keypress", this._keypressHandler, true);
  }
  setupNetworkCapture() {
    const sdkEndpoint = this.logger.getEndpoint();
    if (window.fetch) {
      this.originalFetchUnbound = window.fetch;
      this.originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const startTime = performance.now();
        let url;
        if (typeof args[0] === "string") {
          url = args[0];
        } else if (args[0] instanceof URL) {
          url = args[0].toString();
        } else if (args[0] instanceof Request) {
          url = args[0].url;
        } else {
          url = String(args[0]);
        }
        if (url.startsWith(sdkEndpoint)) {
          return this.originalFetch(...args);
        }
        let method;
        if (args[0] instanceof Request) {
          method = args[0].method;
        } else {
          method = args[1]?.method || "GET";
        }
        try {
          const response = await this.originalFetch(...args);
          const duration = performance.now() - startTime;
          const networkRequest = {
            url: sanitizeUrl(url),
            method,
            status: response.status,
            duration,
            timestamp: Date.now()
          };
          let level = "debug" /* DEBUG */;
          let message = "Network Request";
          if (response.status >= 500) {
            level = "error" /* ERROR */;
            message = "Server Error";
          } else if (response.status >= 400) {
            level = "warn" /* WARN */;
            message = "Client Error";
          } else if (duration > 5e3) {
            level = "warn" /* WARN */;
            message = "Slow Network Request";
          }
          this.breadcrumbManager.add({
            timestamp: Date.now(),
            category: "network",
            message: "Network Request",
            level: response.status >= 400 ? "error" : "info",
            data: { url: sanitizeUrl(url), method, status: response.status, duration }
          });
          this.logger._log(level, message, void 0, {
            eventType: "network",
            network: networkRequest,
            timestamp: Date.now()
          });
          return response;
        } catch (error) {
          const duration = performance.now() - startTime;
          const networkRequest = {
            url: sanitizeUrl(url),
            method,
            duration,
            timestamp: Date.now()
          };
          this.breadcrumbManager.add({
            timestamp: Date.now(),
            category: "network",
            message: "Network Request Failed",
            level: "error",
            data: { url: sanitizeUrl(url), method, duration }
          });
          this.logger._log(
            "error" /* ERROR */,
            "Network Request Failed",
            error,
            {
              eventType: "network",
              network: networkRequest,
              timestamp: Date.now()
            }
          );
          throw error;
        }
      };
    }
    if (window.XMLHttpRequest) {
      const XHR = XMLHttpRequest.prototype;
      this.originalXHROpen = XHR.open;
      this.originalXHRSend = XHR.send;
      const originalXHROpen = this.originalXHROpen;
      const originalXHRSend = this.originalXHRSend;
      const logger = this.logger;
      const breadcrumbMgr = this.breadcrumbManager;
      XHR.open = function(method, url, async, user, password) {
        this._loggerData = {
          method,
          url,
          startTime: performance.now(),
          isSDKRequest: typeof url === "string" && url.startsWith(sdkEndpoint)
        };
        return originalXHROpen?.call(
          this,
          method,
          url,
          async === void 0 ? true : async,
          user,
          password
        );
      };
      XHR.send = function(body) {
        const data = this._loggerData;
        if (data && !data.isSDKRequest) {
          this.addEventListener("loadend", () => {
            const duration = performance.now() - data.startTime;
            const networkRequest = {
              url: sanitizeUrl(data.url),
              method: data.method,
              status: this.status,
              duration,
              timestamp: Date.now()
            };
            let level = "debug" /* DEBUG */;
            let message = "Network Request";
            if (this.status >= 500) {
              level = "error" /* ERROR */;
              message = "Server Error";
            } else if (this.status >= 400) {
              level = "warn" /* WARN */;
              message = "Client Error";
            } else if (duration > 5e3) {
              level = "warn" /* WARN */;
              message = "Slow Network Request";
            }
            breadcrumbMgr.add({
              timestamp: Date.now(),
              category: "network",
              message: "Network Request",
              level: this.status >= 400 ? "error" : "info",
              data: { url: sanitizeUrl(data.url), method: data.method, status: this.status, duration }
            });
            logger._log(level, message, void 0, {
              eventType: "network",
              network: networkRequest,
              timestamp: Date.now()
            });
          });
        }
        return originalXHRSend?.call(this, body);
      };
    }
  }
  setupConsoleCapture() {
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    this.originalConsoleLog = console.log;
    this.originalConsoleInfo = console.info;
    this.originalConsoleDebug = console.debug;
    console.error = (...args) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: "console",
        message: "Console Error",
        level: "error",
        data: { args: args.map((arg) => String(arg)) }
      });
      this.logger._log("error" /* ERROR */, "Console Error", void 0, {
        eventType: "console",
        consoleMethod: "error",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now()
      });
      return this.originalConsoleError?.apply(console, args);
    };
    console.warn = (...args) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: "console",
        message: "Console Warning",
        level: "warning",
        data: { args: args.map((arg) => String(arg)) }
      });
      this.logger._log("warn" /* WARN */, "Console Warning", void 0, {
        eventType: "console",
        consoleMethod: "warn",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now()
      });
      return this.originalConsoleWarn?.apply(console, args);
    };
    console.log = (...args) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: "console",
        message: "Console Log",
        level: "info",
        data: { args: args.map((arg) => String(arg)) }
      });
      this.logger._log("info" /* INFO */, "Console Log", void 0, {
        eventType: "console",
        consoleMethod: "log",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now()
      });
      return this.originalConsoleLog?.apply(console, args);
    };
    console.info = (...args) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: "console",
        message: "Console Info",
        level: "info",
        data: { args: args.map((arg) => String(arg)) }
      });
      this.logger._log("info" /* INFO */, "Console Info", void 0, {
        eventType: "console",
        consoleMethod: "info",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now()
      });
      return this.originalConsoleInfo?.apply(console, args);
    };
    console.debug = (...args) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: "console",
        message: "Console Debug",
        level: "debug",
        data: { args: args.map((arg) => String(arg)) }
      });
      this.logger._log("debug" /* DEBUG */, "Console Debug", void 0, {
        eventType: "console",
        consoleMethod: "debug",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now()
      });
      return this.originalConsoleDebug?.apply(console, args);
    };
  }
  setupPageViewCapture() {
    this.capturePageView();
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;
    const self = this;
    history.pushState = function(...args) {
      self._originalPushState.apply(history, args);
      setTimeout(() => self.capturePageView(), 0);
    };
    history.replaceState = function(...args) {
      self._originalReplaceState.apply(history, args);
      setTimeout(() => self.capturePageView(), 0);
    };
    this._popstateHandler = () => {
      setTimeout(() => this.capturePageView(), 0);
    };
    window.addEventListener("popstate", this._popstateHandler);
  }
  capturePageView() {
    this.breadcrumbManager.add({
      timestamp: Date.now(),
      category: "navigation",
      message: "Page View",
      level: "info",
      data: { url: window.location.href, title: document.title }
    });
    this.logger._log("info" /* INFO */, "Page View", void 0, {
      eventType: "pageview",
      url: window.location.href,
      referrer: document.referrer,
      title: document.title,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    });
  }
  setupWebVitalsCapture() {
    if (!("PerformanceObserver" in window)) {
      return;
    }
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        const value = lastEntry.startTime;
        const rating = this.getVitalRating("LCP", value);
        let level = "debug" /* DEBUG */;
        if (value > 4e3) level = "warn" /* WARN */;
        else if (value > 2500) level = "info" /* INFO */;
        this.logger._log(level, "Web Vital: LCP", void 0, {
          eventType: "web-vital",
          vital: { name: "LCP", value, rating },
          timestamp: Date.now()
        });
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      this.webVitalObservers.push(lcpObserver);
    } catch (e) {
    }
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        const rating = this.getVitalRating("CLS", clsValue);
        let level = "debug" /* DEBUG */;
        if (clsValue > 0.25) level = "warn" /* WARN */;
        else if (clsValue > 0.1) level = "info" /* INFO */;
        this.logger._log(level, "Web Vital: CLS", void 0, {
          eventType: "web-vital",
          vital: { name: "CLS", value: clsValue, rating },
          timestamp: Date.now()
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      this.webVitalObservers.push(clsObserver);
    } catch (e) {
    }
    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.duration;
          const rating = this.getVitalRating("INP", duration);
          let level = "debug" /* DEBUG */;
          if (duration > 500) level = "warn" /* WARN */;
          else if (duration > 200) level = "info" /* INFO */;
          this.logger._log(level, "Web Vital: INP", void 0, {
            eventType: "web-vital",
            vital: { name: "INP", value: duration, rating },
            timestamp: Date.now()
          });
        }
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
      this.webVitalObservers.push(inpObserver);
    } catch (e) {
    }
  }
  getVitalRating(name, value) {
    const thresholds = {
      "LCP": [2500, 4e3],
      "CLS": [0.1, 0.25],
      "INP": [200, 500],
      "FID": [100, 300]
    };
    const [good, poor] = thresholds[name] || [0, 0];
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  }
  destroy() {
    if (this.originalFetchUnbound) {
      window.fetch = this.originalFetchUnbound;
    }
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
    }
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
    if (this.originalConsoleInfo) {
      console.info = this.originalConsoleInfo;
    }
    if (this.originalConsoleDebug) {
      console.debug = this.originalConsoleDebug;
    }
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    for (const observer of this.webVitalObservers) {
      observer.disconnect();
    }
    this.webVitalObservers = [];
    if (this._errorHandler) {
      window.removeEventListener("error", this._errorHandler);
    }
    if (this._rejectionHandler) {
      window.removeEventListener("unhandledrejection", this._rejectionHandler);
    }
    if (this._clickHandler) {
      document.removeEventListener("click", this._clickHandler, true);
    }
    if (this._scrollHandler) {
      document.removeEventListener("scroll", this._scrollHandler, true);
    }
    if (this._focusHandler) {
      document.removeEventListener("focus", this._focusHandler, true);
    }
    if (this._blurHandler) {
      document.removeEventListener("blur", this._blurHandler, true);
    }
    if (this._keypressHandler) {
      document.removeEventListener("keypress", this._keypressHandler, true);
    }
    if (this._popstateHandler) {
      window.removeEventListener("popstate", this._popstateHandler);
    }
    if (this._originalPushState) {
      history.pushState = this._originalPushState;
    }
    if (this._originalReplaceState) {
      history.replaceState = this._originalReplaceState;
    }
  }
};

// src/data-sanitizer.ts
var PII_PATTERNS = [
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL_REDACTED]",
    description: "Email address redaction",
    severity: "high",
    category: "pii"
  },
  // US Social Security Numbers (XXX-XX-XXXX)
  {
    pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
    description: "Social Security Number redaction",
    severity: "critical",
    category: "pii"
  },
  // Credit Card Numbers (various formats)
  {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: "[CARD_REDACTED]",
    description: "Credit card number redaction",
    severity: "critical",
    category: "financial"
  },
  // Phone numbers (US format)
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    replacement: "[PHONE_REDACTED]",
    description: "Phone number redaction",
    severity: "medium",
    category: "pii"
  },
  // IP addresses
  {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: "[IP_REDACTED]",
    description: "IP address redaction",
    severity: "medium",
    category: "pii"
  },
  // API keys and tokens
  {
    pattern: /\b(?:api[_-]?key|token|secret|password|pwd)\s*[:=]\s*['"]?[A-Za-z0-9+/=]{20,}['"]?/gi,
    replacement: "[API_KEY_REDACTED]",
    description: "API key and token redaction",
    severity: "critical",
    category: "authentication"
  },
  // JWT tokens
  {
    pattern: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    replacement: "[JWT_REDACTED]",
    description: "JWT token redaction",
    severity: "critical",
    category: "authentication"
  },
  // Bank account numbers (requires contextual keyword to avoid false positives on UUIDs/timestamps)
  {
    pattern: /(?:account|acct|routing|iban|bank)[#:\s_-]*\d{8,17}\b/gi,
    replacement: "[ACCOUNT_REDACTED]",
    description: "Bank account number redaction",
    severity: "critical",
    category: "financial"
  },
  // Driver's license (US format)
  {
    pattern: /\b[A-Z]\d{8}\b/g,
    replacement: "[DL_REDACTED]",
    description: "Driver's license redaction",
    severity: "high",
    category: "pii"
  },
  // Passport numbers (basic pattern)
  {
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    replacement: "[PASSPORT_REDACTED]",
    description: "Passport number redaction",
    severity: "high",
    category: "pii"
  }
];
var DEFAULT_SANITIZATION_CONFIG = {
  enabled: true,
  rules: PII_PATTERNS,
  customRules: [],
  retentionPolicy: {
    maxAge: 30 * 24 * 60 * 60 * 1e3,
    // 30 days
    maxSize: 100 * 1024 * 1024,
    // 100MB
    autoDelete: true,
    archiveBeforeDelete: true,
    categories: ["pii", "financial", "authentication"]
  },
  auditEnabled: true,
  anonymizationEnabled: true,
  sensitiveFields: ["password", "secret", "token", "key", "ssn", "email"],
  preserveStructure: true
};
var DataSanitizer = class {
  constructor(config = {}) {
    this.auditTrail = [];
    this.retentionCache = /* @__PURE__ */ new Map();
    this.config = { ...DEFAULT_SANITIZATION_CONFIG, ...config };
  }
  /**
   * Sanitize a log entry by applying all configured rules
   */
  sanitizeLogEntry(logEntry) {
    if (!this.config.enabled) {
      return logEntry;
    }
    const startTime = Date.now();
    const originalSize = this.calculateSize(logEntry);
    const rulesApplied = [];
    try {
      const sanitizedEntry = this.deepClone(logEntry);
      if (sanitizedEntry.message) {
        const sanitizedMessage = this.sanitizeString(sanitizedEntry.message, rulesApplied);
        sanitizedEntry.message = sanitizedMessage;
      }
      if (sanitizedEntry.data) {
        sanitizedEntry.data = this.sanitizeObject(sanitizedEntry.data, rulesApplied);
      }
      if (sanitizedEntry.context) {
        sanitizedEntry.context = this.sanitizeObject(sanitizedEntry.context, rulesApplied);
      }
      if (sanitizedEntry.metadata) {
        sanitizedEntry.metadata = this.sanitizeObject(sanitizedEntry.metadata, rulesApplied);
      }
      if (this.config.anonymizationEnabled) {
        this.anonymizeSensitiveFields(sanitizedEntry, rulesApplied);
      }
      if (this.config.auditEnabled) {
        this.recordAuditEntry({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          operation: "sanitize",
          dataType: "log_entry",
          originalSize,
          processedSize: this.calculateSize(sanitizedEntry),
          rulesApplied,
          userId: logEntry.context?.userId,
          sessionId: logEntry.sessionId ?? logEntry.context?.sessionId,
          metadata: {
            processingTime: Date.now() - startTime,
            rulesCount: rulesApplied.length
          }
        });
      }
      return sanitizedEntry;
    } catch (error) {
      console.error("DataSanitizer: Error sanitizing log entry:", error);
      if (this.config.auditEnabled) {
        this.recordAuditEntry({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          operation: "sanitize",
          dataType: "log_entry",
          originalSize,
          processedSize: originalSize,
          rulesApplied: ["ERROR"],
          userId: logEntry.context?.userId,
          sessionId: logEntry.sessionId ?? logEntry.context?.sessionId,
          metadata: { error: error instanceof Error ? error.message : String(error) }
        });
      }
      return logEntry;
    }
  }
  /**
   * Sanitize a string using configured rules
   */
  sanitizeString(input, rulesApplied) {
    let sanitized = input;
    const allRules = [...this.config.rules, ...this.config.customRules];
    for (const rule of allRules) {
      const beforeLength = sanitized.length;
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      if (sanitized.length !== beforeLength) {
        rulesApplied.push(rule.description);
      }
    }
    return sanitized;
  }
  /**
   * Sanitize an object recursively
   */
  sanitizeObject(obj, rulesApplied, seen = /* @__PURE__ */ new WeakSet()) {
    if (obj === null || obj === void 0) {
      return obj;
    }
    if (typeof obj === "string") {
      return this.sanitizeString(obj, rulesApplied);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item, rulesApplied, seen));
    }
    if (typeof obj === "object") {
      if (seen.has(obj)) {
        return "[Circular Reference]";
      }
      seen.add(obj);
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value, rulesApplied, seen);
      }
      return sanitized;
    }
    return obj;
  }
  /**
   * Anonymize sensitive fields
   */
  anonymizeSensitiveFields(logEntry, rulesApplied) {
    const sensitiveFields = this.config.sensitiveFields;
    const visited = /* @__PURE__ */ new WeakSet();
    const anonymizeField = (obj, path = "") => {
      if (obj === null || obj === void 0 || typeof obj !== "object") {
        return;
      }
      if (visited.has(obj)) {
        return;
      }
      visited.add(obj);
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (sensitiveFields.some(
          (field) => key.toLowerCase().includes(field.toLowerCase()) || currentPath.toLowerCase().includes(field.toLowerCase())
        )) {
          if (typeof value === "string") {
            obj[key] = this.anonymizeValue(value);
            rulesApplied.push(`anonymize_${key}`);
          } else if (typeof value === "object" && value !== null) {
            anonymizeField(value, currentPath);
          }
        } else if (typeof value === "object" && value !== null) {
          anonymizeField(value, currentPath);
        }
      }
    };
    if (logEntry.data) {
      anonymizeField(logEntry.data);
    }
    if (logEntry.context) {
      anonymizeField(logEntry.context);
    }
    if (logEntry.metadata) {
      anonymizeField(logEntry.metadata);
    }
  }
  /**
   * Anonymize a value based on its type
   */
  anonymizeValue(value) {
    if (value.length <= 4) {
      return "[ANONYMIZED]";
    }
    const first = value[0];
    const last = value[value.length - 1];
    const middle = "*".repeat(Math.max(2, value.length - 2));
    return `${first}${middle}${last}`;
  }
  /**
   * Check if data should be retained based on retention policy
   */
  shouldRetainData(dataId, timestamp, size) {
    const policy = this.config.retentionPolicy;
    const now = Date.now();
    if (now - timestamp > policy.maxAge) {
      return false;
    }
    if (size > policy.maxSize) {
      return false;
    }
    this.retentionCache.set(dataId, { timestamp, size });
    return true;
  }
  /**
   * Get data that should be deleted based on retention policy
   */
  getDataForDeletion() {
    const policy = this.config.retentionPolicy;
    const now = Date.now();
    const toDelete = [];
    for (const [dataId, info] of this.retentionCache.entries()) {
      if (now - info.timestamp > policy.maxAge || info.size > policy.maxSize) {
        toDelete.push(dataId);
      }
    }
    return toDelete;
  }
  /**
   * Clean up expired data
   */
  cleanupExpiredData() {
    const toDelete = this.getDataForDeletion();
    let cleanedCount = 0;
    for (const dataId of toDelete) {
      this.retentionCache.delete(dataId);
      cleanedCount++;
      if (this.config.auditEnabled) {
        this.recordAuditEntry({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          operation: "delete",
          dataType: "cached_data",
          originalSize: 0,
          processedSize: 0,
          rulesApplied: ["retention_policy"],
          metadata: { dataId, reason: "expired" }
        });
      }
    }
    return cleanedCount;
  }
  /**
   * Get audit trail entries
   */
  getAuditTrail() {
    return [...this.auditTrail];
  }
  /**
   * Clear audit trail
   */
  clearAuditTrail() {
    this.auditTrail = [];
  }
  /**
   * Add custom sanitization rule
   */
  addCustomRule(rule) {
    this.config.customRules.push(rule);
  }
  /**
   * Remove custom sanitization rule
   */
  removeCustomRule(description) {
    const index = this.config.customRules.findIndex((rule) => rule.description === description);
    if (index !== -1) {
      this.config.customRules.splice(index, 1);
      return true;
    }
    return false;
  }
  /**
   * Update sanitization configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * Calculate approximate size of an object in bytes
   */
  calculateSize(obj) {
    try {
      return safeStringify(obj).length * 2;
    } catch {
      return 0;
    }
  }
  /**
   * Deep clone an object
   */
  deepClone(obj, seen = /* @__PURE__ */ new WeakMap()) {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    if (seen.has(obj)) {
      return seen.get(obj);
    }
    if (Array.isArray(obj)) {
      const arr = [];
      seen.set(obj, arr);
      for (const item of obj) {
        arr.push(this.deepClone(item, seen));
      }
      return arr;
    }
    const cloned = {};
    seen.set(obj, cloned);
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key], seen);
      }
    }
    return cloned;
  }
  /**
   * Record an audit entry
   */
  recordAuditEntry(entry) {
    this.auditTrail.push(entry);
    if (this.auditTrail.length > 1e3) {
      this.auditTrail = this.auditTrail.slice(-1e3);
    }
  }
};
function createDataSanitizer(config = {}) {
  return new DataSanitizer(config);
}
var SANITIZATION_PRESETS = {
  // Strict configuration for highly sensitive data
  STRICT: {
    enabled: true,
    rules: PII_PATTERNS,
    customRules: [],
    retentionPolicy: {
      maxAge: 7 * 24 * 60 * 60 * 1e3,
      // 7 days
      maxSize: 50 * 1024 * 1024,
      // 50MB
      autoDelete: true,
      archiveBeforeDelete: true,
      categories: ["pii", "financial", "authentication"]
    },
    auditEnabled: true,
    anonymizationEnabled: true,
    sensitiveFields: ["password", "secret", "token", "key", "ssn", "email", "phone", "address"],
    preserveStructure: true
  },
  // Balanced configuration for general enterprise use
  BALANCED: DEFAULT_SANITIZATION_CONFIG,
  // Lenient configuration for development/testing
  LENIENT: {
    enabled: true,
    rules: PII_PATTERNS.filter((rule) => rule.severity === "critical"),
    customRules: [],
    retentionPolicy: {
      maxAge: 90 * 24 * 60 * 60 * 1e3,
      // 90 days
      maxSize: 500 * 1024 * 1024,
      // 500MB
      autoDelete: false,
      archiveBeforeDelete: false,
      categories: ["pii", "financial"]
    },
    auditEnabled: false,
    anonymizationEnabled: false,
    sensitiveFields: ["password", "secret"],
    preserveStructure: true
  }
};

// src/offline-manager.ts
var CRITICAL_LEVELS = /* @__PURE__ */ new Set(["error" /* ERROR */, "fatal" /* FATAL */]);
var OfflineManager = class {
  constructor(config = {}) {
    this.queue = [];
    this._isOnline = true;
    this.flushCallback = null;
    this.onlineHandler = null;
    this.offlineHandler = null;
    this._isFlushing = false;
    this.config = {
      maxQueueSize: config.maxQueueSize ?? 500,
      prioritizeCritical: config.prioritizeCritical ?? true,
      onSyncComplete: config.onSyncComplete,
      onOffline: config.onOffline,
      onOnline: config.onOnline
    };
    if (isInBrowser() && typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      this._isOnline = navigator.onLine;
    }
    if (isInBrowser()) {
      this.setupListeners();
    }
  }
  /**
   * Returns the current online status.
   */
  isOnline() {
    return this._isOnline;
  }
  /**
   * Registers the callback that sends queued logs through the logger's pipeline.
   * Must be called before logs can be flushed.
   */
  setFlushCallback(callback) {
    this.flushCallback = callback;
  }
  /**
   * Enqueue a log entry for later transmission.
   *
   * When the queue is full:
   * - If `prioritizeCritical` is enabled, the first non-critical (non ERROR/FATAL)
   *   log is found and evicted to make room. If all entries are critical, the oldest
   *   entry is dropped.
   * - Otherwise, the oldest entry is dropped unconditionally.
   */
  enqueue(log) {
    if (this.queue.length >= this.config.maxQueueSize) {
      if (this.config.prioritizeCritical) {
        const evictIndex = this.queue.findIndex(
          (entry) => !CRITICAL_LEVELS.has(entry.level)
        );
        if (evictIndex !== -1) {
          this.queue.splice(evictIndex, 1);
        } else {
          this.queue.shift();
        }
      } else {
        this.queue.shift();
      }
    }
    this.queue.push(log);
  }
  /**
   * Returns the number of logs currently queued.
   */
  getQueueSize() {
    return this.queue.length;
  }
  /**
   * Flush all queued logs through the registered flush callback.
   * Called automatically when the browser comes back online.
   *
   * On flush failure, logs are re-queued (up to maxQueueSize).
   */
  async flushOfflineQueue() {
    if (this._isFlushing || this.queue.length === 0 || !this.flushCallback) {
      return;
    }
    this._isFlushing = true;
    const logsToFlush = [...this.queue];
    this.queue = [];
    try {
      await this.flushCallback(logsToFlush);
      this.config.onSyncComplete?.(logsToFlush.length);
    } catch (error) {
      console.warn(
        `[Apperio OfflineManager] Failed to flush ${logsToFlush.length} queued logs. Re-queuing.`
      );
      const combined = [...logsToFlush, ...this.queue];
      this.queue = combined.slice(0, this.config.maxQueueSize);
      if (combined.length > this.config.maxQueueSize) {
        console.warn(
          `[Apperio OfflineManager] Dropped ${combined.length - this.config.maxQueueSize} logs due to queue overflow during re-queue.`
        );
      }
    } finally {
      this._isFlushing = false;
    }
  }
  /**
   * Tear down listeners and clear internal state.
   */
  destroy() {
    if (isInBrowser()) {
      if (this.onlineHandler) {
        window.removeEventListener("online", this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener("offline", this.offlineHandler);
        this.offlineHandler = null;
      }
    }
    this.queue = [];
    this.flushCallback = null;
  }
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------
  setupListeners() {
    this.onlineHandler = () => {
      this._isOnline = true;
      this.config.onOnline?.();
      this.flushOfflineQueue();
    };
    this.offlineHandler = () => {
      this._isOnline = false;
      this.config.onOffline?.();
    };
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
  }
};

// src/remote-config.ts
var RemoteConfigManager = class {
  constructor(projectId, apiKey, baseEndpoint, options = {}) {
    this.lastConfig = null;
    this.refreshTimer = null;
    this.applyCallback = null;
    this.projectId = projectId;
    this.apiKey = apiKey;
    this.baseEndpoint = baseEndpoint;
    this.options = {
      enabled: options.enabled ?? false,
      refreshIntervalMs: options.refreshIntervalMs ?? 3e5,
      endpoint: options.endpoint,
      onConfigUpdate: options.onConfigUpdate
    };
  }
  /**
   * Registers a callback that the logger uses to apply fetched configuration.
   */
  setApplyCallback(callback) {
    this.applyCallback = callback;
  }
  /**
   * Fetch the remote SDK configuration from the backend.
   *
   * Returns the parsed config on success, or `null` on any failure.
   * Failures are logged as warnings but never thrown.
   */
  async fetchConfig() {
    const url = this.getEndpoint();
    try {
      if (typeof fetch === "undefined") {
        console.warn("[Apperio RemoteConfig] fetch API is not available in this environment.");
        return null;
      }
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "Accept": "application/json"
        }
      });
      if (!response.ok) {
        console.warn(
          `[Apperio RemoteConfig] Config fetch failed with status ${response.status}.`
        );
        return null;
      }
      const body = await response.json();
      const config = body?.data ?? body;
      this.lastConfig = config;
      this.options.onConfigUpdate?.(config);
      this.applyCallback?.(config);
      return config;
    } catch (error) {
      console.warn("[Apperio RemoteConfig] Failed to fetch remote config:", error);
      return null;
    }
  }
  /**
   * Begin polling the backend for config updates at the configured interval.
   * Performs an initial fetch immediately.
   */
  startPeriodicRefresh() {
    if (!this.options.enabled) {
      return;
    }
    this.stopPeriodicRefresh();
    this.fetchConfig();
    this.refreshTimer = setInterval(() => {
      this.fetchConfig();
    }, this.options.refreshIntervalMs);
  }
  /**
   * Stop the periodic refresh timer.
   */
  stopPeriodicRefresh() {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  /**
   * Returns the most recently fetched config, or `null` if none has been fetched yet.
   */
  getLastConfig() {
    return this.lastConfig;
  }
  /**
   * Clean up all resources held by the manager.
   */
  destroy() {
    this.stopPeriodicRefresh();
    this.lastConfig = null;
    this.applyCallback = null;
  }
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------
  getEndpoint() {
    if (this.options.endpoint) {
      return this.options.endpoint;
    }
    return `${this.baseEndpoint}/sdk-config`;
  }
};

// src/tracing/span.ts
function generateUUID2() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function getHighResTime() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
var Span = class {
  constructor(name, traceId, parentSpanId) {
    this.data = {
      spanId: generateUUID2(),
      traceId,
      parentSpanId,
      name,
      startTime: getHighResTime(),
      status: "pending",
      attributes: {}
    };
  }
  /**
   * Sets a key-value attribute on this span.
   */
  setAttribute(key, value) {
    this.data.attributes[key] = value;
  }
  /**
   * Ends the span, recording the end time and calculating duration.
   * Returns a frozen copy of the span data.
   */
  end(status = "ok") {
    this.data.endTime = getHighResTime();
    this.data.duration = this.data.endTime - this.data.startTime;
    this.data.status = status;
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
  /**
   * Returns a copy of the current span data without ending the span.
   */
  getData() {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
};

// src/tracing/trace-context.ts
function generateUUID3() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var TraceContextManager = class {
  constructor() {
    this.currentTrace = null;
    this.activeSpans = /* @__PURE__ */ new Map();
  }
  /**
   * Starts a new trace with the given name.
   * Generates a fresh traceId and root spanId, marks the trace as sampled,
   * and stores it as the current trace context.
   */
  startTrace(name) {
    const traceId = generateUUID3();
    const spanId = generateUUID3();
    this.currentTrace = {
      traceId,
      spanId,
      sampled: true
    };
    const rootSpan = new Span(name, traceId);
    this.activeSpans.set(rootSpan.getData().spanId, rootSpan);
    return { ...this.currentTrace };
  }
  /**
   * Ends the current trace, clearing the context and all active spans.
   */
  endTrace() {
    this.currentTrace = null;
    this.activeSpans.clear();
  }
  /**
   * Returns a copy of the current trace context, or null if no trace is active.
   */
  getCurrentTrace() {
    if (!this.currentTrace) {
      return null;
    }
    return { ...this.currentTrace };
  }
  /**
   * Returns HTTP headers for trace propagation.
   * If no trace is active, returns an empty object.
   */
  getTraceHeaders() {
    if (!this.currentTrace) {
      return {};
    }
    return {
      "X-Trace-ID": this.currentTrace.traceId,
      "X-Span-ID": this.currentTrace.spanId
    };
  }
  /**
   * Creates a child span under the current trace.
   * The child span's parentSpanId is set to the current trace's spanId.
   * Throws if no trace is active.
   */
  createChildSpan(name) {
    if (!this.currentTrace) {
      throw new Error("Cannot create child span: no active trace");
    }
    const child = new Span(name, this.currentTrace.traceId, this.currentTrace.spanId);
    this.activeSpans.set(child.getData().spanId, child);
    return child;
  }
  /**
   * Registers an externally-created span in the active spans registry.
   */
  addSpan(span) {
    const data = span.getData();
    this.activeSpans.set(data.spanId, span);
  }
  /**
   * Removes a span from the active spans registry by its ID.
   */
  removeSpan(spanId) {
    this.activeSpans.delete(spanId);
  }
};

// src/pattern-detector.ts
var PatternDetector = class {
  constructor(options) {
    this._errors = [];
    this._lastPatternEmit = /* @__PURE__ */ new Map();
    this._maxWindowSize = options?.maxWindowSize ?? 100;
    this._recurringThreshold = options?.recurringThreshold ?? 3;
    this._recurringWindowMs = options?.recurringWindowMs ?? 5 * 60 * 1e3;
    this._spikeMultiplier = options?.spikeMultiplier ?? 3;
    this._spikeShortWindowMs = options?.spikeShortWindowMs ?? 60 * 1e3;
    this._spikeLongWindowMs = options?.spikeLongWindowMs ?? 10 * 60 * 1e3;
    this._throttleMs = options?.throttleMs ?? 5 * 60 * 1e3;
  }
  /**
   * Feed an error into the pattern detector.
   */
  recordError(message) {
    const now = Date.now();
    this._errors.push({ message, timestamp: now });
    if (this._errors.length > this._maxWindowSize) {
      this._errors = this._errors.slice(-this._maxWindowSize);
    }
  }
  /**
   * Detect recurring errors — groups by message similarity,
   * flags groups with threshold+ occurrences in the window.
   */
  detectRecurringErrors() {
    const now = Date.now();
    const cutoff = now - this._recurringWindowMs;
    const recent = this._errors.filter((e) => e.timestamp >= cutoff);
    const groups = /* @__PURE__ */ new Map();
    for (const entry of recent) {
      const key = entry.message.slice(0, 80);
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    const patterns = [];
    for (const [msg, count] of groups) {
      if (count >= this._recurringThreshold) {
        patterns.push({
          type: "recurring_error",
          message: msg,
          count,
          windowMs: this._recurringWindowMs,
          detectedAt: new Date(now).toISOString()
        });
      }
    }
    return patterns;
  }
  /**
   * Detect error spike — compares last-minute error count
   * against rolling 10-minute average, flags if > multiplier.
   */
  detectErrorSpike() {
    const now = Date.now();
    const shortCutoff = now - this._spikeShortWindowMs;
    const longCutoff = now - this._spikeLongWindowMs;
    const shortCount = this._errors.filter((e) => e.timestamp >= shortCutoff).length;
    const longErrors = this._errors.filter((e) => e.timestamp >= longCutoff);
    const longWindowCount = Math.max(longErrors.length, 1);
    const windowsInLong = this._spikeLongWindowMs / this._spikeShortWindowMs;
    const avgPerShortWindow = longWindowCount / windowsInLong;
    if (shortCount > avgPerShortWindow * this._spikeMultiplier && shortCount >= 3) {
      return {
        type: "error_spike",
        message: `${shortCount} errors in the last ${Math.round(this._spikeShortWindowMs / 1e3)}s (${this._spikeMultiplier}x above average)`,
        count: shortCount,
        windowMs: this._spikeShortWindowMs,
        detectedAt: new Date(now).toISOString()
      };
    }
    return null;
  }
  /**
   * Run all detectors and return patterns that haven't been emitted recently.
   */
  getPatterns() {
    const now = Date.now();
    const allPatterns = [];
    const recurring = this.detectRecurringErrors();
    allPatterns.push(...recurring);
    const spike = this.detectErrorSpike();
    if (spike) {
      allPatterns.push(spike);
    }
    const newPatterns = [];
    for (const pattern of allPatterns) {
      const key = `${pattern.type}:${pattern.message.slice(0, 40)}`;
      const lastEmit = this._lastPatternEmit.get(key) || 0;
      if (now - lastEmit >= this._throttleMs) {
        this._lastPatternEmit.set(key, now);
        newPatterns.push(pattern);
      }
    }
    return newPatterns;
  }
  /**
   * Clear all tracked errors and pattern history.
   */
  reset() {
    this._errors = [];
    this._lastPatternEmit.clear();
  }
};

// src/logger.ts
var _Apperio = class _Apperio {
  constructor(config) {
    this._logBuffer = [];
    this._context = {};
    this._flushTimer = null;
    this._isFlushing = false;
    this._isShuttingDown = false;
    this._initialized = false;
    this._beforeUnloadHandler = null;
    this._offlineManager = null;
    this._remoteConfigManager = null;
    this._traceContextManager = null;
    this._patternDetector = null;
    this._lastTimestamp = "";
    this._timestampCounter = 0;
    this._config = {
      endpoint: "https://apperioserver.onrender.com/api/v1",
      minLogLevel: "info" /* INFO */,
      batchSize: 10,
      flushIntervalMs: 5e3,
      maxRetries: 3,
      retryDelayMs: 1e3,
      environment: "development",
      serviceName: "unknown-service",
      serviceVersion: "1.0.0",
      ...config,
      // Merge autoCapture with defaults
      autoCapture: {
        errors: true,
        performance: true,
        userInteractions: false,
        networkRequests: true,
        consoleMessages: false,
        pageViews: true,
        ...config.autoCapture || {}
      },
      // Merge sanitization with defaults
      sanitization: {
        enabled: true,
        ...config.sanitization || {}
      },
      // Phase 2 defaults
      release: config.release || "",
      offline: config.offline || {},
      remoteConfig: config.remoteConfig || {},
      tracing: {
        enabled: false,
        autoTraceNetworkRequests: false,
        ...config.tracing || {}
      },
      enablePatternDetection: config.enablePatternDetection !== false,
      onPatternDetected: config.onPatternDetected || void 0
    };
    if (!this._config.apiKey) {
      throw new Error("Apperio: API Key is required.");
    }
    if (!this._config.projectId) {
      throw new Error("Apperio: Project ID is required.");
    }
    this._headers = {
      "Content-Type": "application/json",
      "X-API-Key": this._config.apiKey
    };
    this._autoInstrumentation = new AutoInstrumentation(this);
    const sanitizationConfig = config.sanitization?.config || {};
    this._dataSanitizer = createDataSanitizer(sanitizationConfig);
    this.init();
  }
  isInitialized() {
    return this._initialized;
  }
  init() {
    if (this._initialized) {
      console.warn("Apperio: Already initialized. Call shutdown() first to re-initialize.");
      return;
    }
    this._initialized = true;
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
    }
    this._flushTimer = setInterval(() => {
      this.flush();
    }, this._config.flushIntervalMs);
    if (isInBrowser()) {
      this._autoInstrumentation.init(this._config.autoCapture);
      this.setContext({
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      this._beforeUnloadHandler = () => {
        this.flush();
      };
      window.addEventListener("beforeunload", this._beforeUnloadHandler);
    } else {
      this.setContext({
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      process.on("exit", () => {
        this.flush();
      });
      process.on("SIGINT", async () => {
        await this.shutdown();
        process.exit(0);
      });
      process.on("SIGTERM", async () => {
        await this.shutdown();
        process.exit(0);
      });
    }
    if (this._config.offline) {
      this._offlineManager = new OfflineManager(this._config.offline);
      this._offlineManager.setFlushCallback(async (logs) => {
        await this._sendLogs(logs);
      });
    }
    if (this._config.tracing?.enabled) {
      this._traceContextManager = new TraceContextManager();
    }
    if (this._config.enablePatternDetection) {
      this._patternDetector = new PatternDetector();
    }
    if (this._config.remoteConfig?.enabled) {
      this._remoteConfigManager = new RemoteConfigManager(
        this._config.projectId,
        this._config.apiKey,
        this._config.endpoint,
        this._config.remoteConfig
      );
      this._remoteConfigManager.setApplyCallback((config) => {
        this._applyRemoteConfig(config);
      });
      this._remoteConfigManager.startPeriodicRefresh();
    }
  }
  setContext(context) {
    this._context = { ...this._context, ...context };
  }
  getContext() {
    return { ...this._context };
  }
  clearContext() {
    this._context = {};
  }
  getEndpoint() {
    return this._config.endpoint;
  }
  _log(level, message, error, data) {
    if (this._isShuttingDown) {
      console.warn(`Apperio: Attempted to log "${message}" during shutdown. Log ignored.`);
      return;
    }
    if (!shouldLog(level, this._config.minLogLevel)) {
      return;
    }
    let timestamp = (/* @__PURE__ */ new Date()).toISOString();
    if (timestamp === this._lastTimestamp) {
      this._timestampCounter++;
      const adjusted = new Date(new Date(timestamp).getTime() + this._timestampCounter);
      timestamp = adjusted.toISOString();
    } else {
      this._lastTimestamp = timestamp;
      this._timestampCounter = 0;
    }
    const logEntry = {
      projectId: this._config.projectId,
      timestamp,
      level,
      message,
      data,
      error: error ? extractErrorDetails(error) : void 0,
      service: this._config.serviceName,
      environment: this._config.environment,
      context: { ...this._context },
      sessionId: getSessionId()
    };
    if (data?.eventType) {
      logEntry.eventType = data.eventType;
    }
    if (this._config.release) {
      logEntry.release = this._config.release;
    }
    if (this._traceContextManager) {
      const trace = this._traceContextManager.getCurrentTrace();
      if (trace) {
        logEntry.traceId = trace.traceId;
        logEntry.spanId = trace.spanId;
      }
    }
    if (isInBrowser()) {
      logEntry.userAgent = navigator.userAgent;
      logEntry.url = window.location.href;
      logEntry.referrer = document.referrer;
    }
    const sanitizedEntry = this._config.sanitization?.enabled !== false ? this._dataSanitizer.sanitizeLogEntry(logEntry) : logEntry;
    if (this._offlineManager && !this._offlineManager.isOnline()) {
      this._offlineManager.enqueue(sanitizedEntry);
      return;
    }
    const isDuplicate = this._logBuffer.some(
      (existing) => existing.message === sanitizedEntry.message && existing.timestamp === sanitizedEntry.timestamp
    );
    if (isDuplicate) return;
    this._logBuffer.push(sanitizedEntry);
    if (this._patternDetector && (level === "error" /* ERROR */ || level === "fatal" /* FATAL */)) {
      const errorMsg = error?.message || message;
      this._patternDetector.recordError(errorMsg);
      const patterns = this._patternDetector.getPatterns();
      for (const pattern of patterns) {
        if (this._config.onPatternDetected) {
          try {
            this._config.onPatternDetected(pattern);
          } catch {
          }
        }
        const patternEntry = {
          projectId: this._config.projectId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "warn" /* WARN */,
          message: `[Pattern Detection] ${pattern.type}: ${pattern.message}`,
          data: {
            patternType: pattern.type,
            count: pattern.count,
            windowMs: pattern.windowMs
          },
          service: this._config.serviceName,
          environment: this._config.environment,
          eventType: "message",
          context: { ...this._context },
          sessionId: getSessionId()
        };
        this._logBuffer.push(patternEntry);
      }
    }
    if (this._logBuffer.length > _Apperio.MAX_BUFFER_SIZE) {
      const dropped = this._logBuffer.length - _Apperio.MAX_BUFFER_SIZE;
      this._logBuffer = this._logBuffer.slice(-_Apperio.MAX_BUFFER_SIZE);
      console.warn(`Apperio: Dropped ${dropped} oldest logs due to buffer overflow.`);
    }
    if (this._logBuffer.length >= this._config.batchSize) {
      this.flush();
    }
  }
  trace(message, data) {
    this._log("trace" /* TRACE */, message, void 0, data);
  }
  debug(message, data) {
    this._log("debug" /* DEBUG */, message, void 0, data);
  }
  info(message, data) {
    this._log("info" /* INFO */, message, void 0, data);
  }
  warn(message, data) {
    this._log("warn" /* WARN */, message, void 0, data);
  }
  error(message, error, data) {
    this._log("error" /* ERROR */, message, error, data);
  }
  fatal(message, error, data) {
    this._log("fatal" /* FATAL */, message, error, data);
  }
  // Enhanced methods for specific event types
  captureException(error, context) {
    const previousContext = { ...this._context };
    if (context) {
      this._context = { ...this._context, ...context };
    }
    this._log("error" /* ERROR */, "Exception captured", error, {
      eventType: "error"
    });
    if (context) {
      this._context = previousContext;
    }
  }
  captureMessage(message, level = "info" /* INFO */, context) {
    const previousContext = { ...this._context };
    if (context) {
      this._context = { ...this._context, ...context };
    }
    this._log(level, message, void 0, {
      eventType: "message"
    });
    if (context) {
      this._context = previousContext;
    }
  }
  addBreadcrumb(message, category, data) {
    this._log("debug" /* DEBUG */, message, void 0, {
      eventType: "breadcrumb",
      category,
      ...data
    });
  }
  async flush() {
    if (this._isFlushing || this._logBuffer.length === 0) {
      return;
    }
    this._isFlushing = true;
    const logsToSend = [...this._logBuffer];
    this._logBuffer = [];
    try {
      await this._sendLogs(logsToSend);
    } catch (err) {
      console.error("Apperio: Failed to send logs after retries. Re-adding to buffer.", err);
      this._logBuffer.unshift(...logsToSend);
      if (this._logBuffer.length > _Apperio.MAX_BUFFER_SIZE) {
        const dropped = this._logBuffer.length - _Apperio.MAX_BUFFER_SIZE;
        this._logBuffer = this._logBuffer.slice(0, _Apperio.MAX_BUFFER_SIZE);
        console.warn(`Apperio: Dropped ${dropped} oldest logs due to buffer overflow.`);
      }
    } finally {
      this._isFlushing = false;
    }
  }
  async _sendLogs(logs) {
    if (logs.length === 0) {
      return;
    }
    const url = `${this._config.endpoint}/${this._config.projectId}/logs/batch`;
    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this._headers,
          body: JSON.stringify({ logs })
        });
        if (response.ok) {
          return;
        }
        if (response.status >= 400 && response.status < 500) {
          if (response.status === 401 || response.status === 403) {
            console.error("Apperio: Authentication/Authorization failed. Check API Key.");
          }
          throw new Error(`Apperio: Non-retryable API error: ${response.status}`);
        }
        console.warn(`Apperio: API returned status ${response.status} on attempt ${attempt + 1}.`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Apperio: Non-retryable")) {
          throw error;
        }
        console.error(`Apperio: Network error on attempt ${attempt + 1}:`, error.message);
      }
      if (attempt < this._config.maxRetries) {
        const retryDelay = getExponentialBackoffDelay(attempt, this._config.retryDelayMs);
        console.warn(`Apperio: Retrying in ${retryDelay}ms... (Attempt ${attempt + 1} of ${this._config.maxRetries})`);
        await delay(retryDelay);
      }
    }
    throw new Error(`Apperio: Failed to send logs after ${this._config.maxRetries} retries.`);
  }
  // Data sanitization methods
  getSanitizationConfig() {
    return this._dataSanitizer.getConfig();
  }
  updateSanitizationConfig(config) {
    this._dataSanitizer.updateConfig(config);
  }
  getAuditTrail() {
    return this._dataSanitizer.getAuditTrail();
  }
  clearAuditTrail() {
    this._dataSanitizer.clearAuditTrail();
  }
  cleanupExpiredData() {
    return this._dataSanitizer.cleanupExpiredData();
  }
  addCustomSanitizationRule(rule) {
    this._dataSanitizer.addCustomRule(rule);
  }
  removeCustomSanitizationRule(description) {
    return this._dataSanitizer.removeCustomRule(description);
  }
  // --- Distributed Tracing API ---
  startTrace(name) {
    if (!this._traceContextManager) {
      return null;
    }
    return this._traceContextManager.startTrace(name);
  }
  endTrace() {
    this._traceContextManager?.endTrace();
  }
  getCurrentTrace() {
    return this._traceContextManager?.getCurrentTrace() ?? null;
  }
  createChildSpan(name) {
    if (!this._traceContextManager) {
      return null;
    }
    return this._traceContextManager.createChildSpan(name);
  }
  // --- Remote Configuration ---
  _applyRemoteConfig(config) {
    if (config.minLogLevel) {
      this._config.minLogLevel = config.minLogLevel;
    }
    if (config.batchSize !== void 0) {
      this._config.batchSize = config.batchSize;
    }
    if (config.flushIntervalMs !== void 0) {
      this._config.flushIntervalMs = config.flushIntervalMs;
      if (this._flushTimer) {
        clearInterval(this._flushTimer);
        this._flushTimer = setInterval(() => {
          this.flush();
        }, this._config.flushIntervalMs);
      }
    }
    if (config.autoCapture) {
      this._config.autoCapture = { ...this._config.autoCapture, ...config.autoCapture };
    }
    if (config.sanitization?.preset) {
      const preset = SANITIZATION_PRESETS[config.sanitization.preset];
      if (preset) {
        this._dataSanitizer.updateConfig(preset);
      }
    }
  }
  async shutdown() {
    this._isShuttingDown = true;
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this.cleanupExpiredData();
    this._autoInstrumentation.destroy();
    if (this._offlineManager) {
      this._offlineManager.destroy();
      this._offlineManager = null;
    }
    if (this._remoteConfigManager) {
      this._remoteConfigManager.destroy();
      this._remoteConfigManager = null;
    }
    if (this._traceContextManager) {
      this._traceContextManager.endTrace();
      this._traceContextManager = null;
    }
    if (this._patternDetector) {
      this._patternDetector.reset();
      this._patternDetector = null;
    }
    if (isInBrowser() && this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    console.log("Apperio: Shutting down. Flushing remaining logs...");
    await this.flush();
    console.log("Apperio: Shutdown complete.");
    this._initialized = false;
    this._isShuttingDown = false;
  }
};
_Apperio.MAX_BUFFER_SIZE = 1e3;
var Apperio = _Apperio;

// src/circuit-breaker.ts
var CircuitBreakerState = /* @__PURE__ */ ((CircuitBreakerState2) => {
  CircuitBreakerState2["CLOSED"] = "CLOSED";
  CircuitBreakerState2["OPEN"] = "OPEN";
  CircuitBreakerState2["HALF_OPEN"] = "HALF_OPEN";
  return CircuitBreakerState2;
})(CircuitBreakerState || {});
var CircuitBreaker = class {
  constructor(config = {}) {
    this.state = "CLOSED" /* CLOSED */;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      cooldownMs: config.cooldownMs || 3e4,
      onStateChange: config.onStateChange
    };
  }
  /**
   * Get current circuit breaker state
   */
  getState() {
    if (this.state === "OPEN" /* OPEN */) {
      const now = Date.now();
      const timeSinceFailure = now - this.lastFailureTime;
      if (timeSinceFailure >= this.config.cooldownMs) {
        this.transitionTo(
          "HALF_OPEN" /* HALF_OPEN */,
          "Cooldown period elapsed, testing service recovery"
        );
      }
    }
    return this.state;
  }
  /**
   * Check if a request should be allowed through
   */
  async execute(operation) {
    const currentState = this.getState();
    if (currentState === "OPEN" /* OPEN */) {
      return {
        success: false,
        error: new Error(
          `Circuit breaker is OPEN. Service will be retried after cooldown period.`
        )
      };
    }
    try {
      const result = await operation();
      this.onSuccess();
      return { success: true, result };
    } catch (error) {
      this.onFailure();
      return { success: false, error };
    }
  }
  /**
   * Record a successful operation
   */
  onSuccess() {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN" /* HALF_OPEN */) {
      this.successCount++;
      this.transitionTo(
        "CLOSED" /* CLOSED */,
        "Service recovered successfully"
      );
    }
  }
  /**
   * Record a failed operation
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === "HALF_OPEN" /* HALF_OPEN */) {
      this.transitionTo(
        "OPEN" /* OPEN */,
        "Service still failing during recovery test"
      );
    } else if (this.state === "CLOSED" /* CLOSED */ && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(
        "OPEN" /* OPEN */,
        `Failure threshold (${this.config.failureThreshold}) reached`
      );
    }
  }
  /**
   * Transition to a new state
   */
  transitionTo(newState, reason) {
    if (this.state === newState) {
      return;
    }
    const previousState = this.state;
    this.state = newState;
    if (newState === "CLOSED" /* CLOSED */) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === "HALF_OPEN" /* HALF_OPEN */) {
      this.successCount = 0;
    }
    if (this.config.onStateChange) {
      this.config.onStateChange(newState, reason);
    }
    console.log(
      `[CircuitBreaker] State transition: ${previousState} \u2192 ${newState} | Reason: ${reason}`
    );
  }
  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.transitionTo(
      "CLOSED" /* CLOSED */,
      "Manual reset by application"
    );
  }
  /**
   * Get current failure count
   */
  getFailureCount() {
    return this.failureCount;
  }
  /**
   * Get current success count (relevant in HALF_OPEN state)
   */
  getSuccessCount() {
    return this.successCount;
  }
  /**
   * Get time until circuit will attempt recovery (OPEN → HALF_OPEN)
   * Returns 0 if not in OPEN state
   */
  getTimeUntilRetry() {
    if (this.state !== "OPEN" /* OPEN */) {
      return 0;
    }
    const now = Date.now();
    const timeSinceFailure = now - this.lastFailureTime;
    const remaining = this.config.cooldownMs - timeSinceFailure;
    return Math.max(0, remaining);
  }
  /**
   * Check if circuit breaker is currently allowing requests
   */
  isOpen() {
    return this.getState() === "OPEN" /* OPEN */;
  }
  /**
   * Check if circuit breaker is in closed state (normal operation)
   */
  isClosed() {
    return this.getState() === "CLOSED" /* CLOSED */;
  }
  /**
   * Check if circuit breaker is testing recovery
   */
  isHalfOpen() {
    return this.getState() === "HALF_OPEN" /* HALF_OPEN */;
  }
};

// src/compression.ts
var MIN_COMPRESSION_SIZE = 1024;
async function compressPayload(payload, minSize = MIN_COMPRESSION_SIZE) {
  const jsonString = JSON.stringify(payload);
  const originalSize = jsonString.length;
  if (originalSize < minSize) {
    return {
      data: jsonString,
      compressed: false,
      originalSize,
      compressedSize: originalSize
    };
  }
  if (isInBrowser() && "CompressionStream" in window) {
    try {
      const compressedData = await compressWithCompressionStream(jsonString);
      return {
        data: compressedData,
        compressed: true,
        originalSize,
        compressedSize: compressedData.byteLength,
        encoding: "gzip"
      };
    } catch (error) {
      console.warn("CompressionStream failed, falling back to uncompressed:", error);
      return {
        data: jsonString,
        compressed: false,
        originalSize,
        compressedSize: originalSize
      };
    }
  }
  if (!isInBrowser() && typeof __require !== "undefined") {
    try {
      const compressedData = await compressWithZlib(jsonString);
      return {
        data: compressedData,
        compressed: true,
        originalSize,
        compressedSize: compressedData.byteLength,
        encoding: "gzip"
      };
    } catch (error) {
      console.warn("zlib compression failed, falling back to uncompressed:", error);
      return {
        data: jsonString,
        compressed: false,
        originalSize,
        compressedSize: originalSize
      };
    }
  }
  return {
    data: jsonString,
    compressed: false,
    originalSize,
    compressedSize: originalSize
  };
}
async function compressWithCompressionStream(text) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(text);
  const compressionStream = new CompressionStream("gzip");
  const writer = compressionStream.writable.getWriter();
  writer.write(uint8Array);
  writer.close();
  const chunks = [];
  const reader = compressionStream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function compressWithZlib(text) {
  const zlib = __require("zlib");
  const util = __require("util");
  const gzipAsync = util.promisify(zlib.gzip);
  const buffer = Buffer.from(text, "utf8");
  const compressed = await gzipAsync(buffer);
  return new Uint8Array(compressed);
}
function uint8ArrayToBase64(uint8Array) {
  if (isInBrowser()) {
    const binaryString = String.fromCharCode(...uint8Array);
    return btoa(binaryString);
  } else {
    return Buffer.from(uint8Array).toString("base64");
  }
}
async function preparePayloadForTransmission(payload, compressionEnabled = true) {
  if (!compressionEnabled) {
    const jsonString = JSON.stringify(payload);
    return {
      data: jsonString,
      headers: {
        "Content-Type": "application/json"
      },
      metadata: {
        compressed: false,
        originalSize: jsonString.length,
        compressedSize: jsonString.length
      }
    };
  }
  const result = await compressPayload(payload);
  if (result.compressed && result.data instanceof Uint8Array) {
    const base64Data = uint8ArrayToBase64(result.data);
    return {
      data: base64Data,
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": result.encoding || "gzip",
        "X-Original-Size": result.originalSize.toString(),
        "X-Compressed-Size": result.compressedSize.toString()
      },
      metadata: {
        compressed: true,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.originalSize / result.compressedSize
      }
    };
  }
  return {
    data: result.data,
    headers: {
      "Content-Type": "application/json"
    },
    metadata: {
      compressed: false,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize
    }
  };
}

// src/health-metrics.ts
var HealthMetricsCollector = class {
  constructor() {
    this.flushDurations = [];
    this.errorCounts = /* @__PURE__ */ new Map();
    this.metrics = {
      logsBuffered: 0,
      logsFlushed: 0,
      logsDropped: 0,
      logsRetried: 0,
      bufferHighWatermark: 0,
      currentBufferSize: 0,
      totalFlushes: 0,
      successfulFlushes: 0,
      failedFlushes: 0,
      flushSuccessRate: 100,
      averageFlushDurationMs: 0,
      minFlushDurationMs: 0,
      maxFlushDurationMs: 0,
      totalFlushDurationMs: 0,
      circuitBreakerState: "CLOSED",
      circuitBreakerStateChanges: 0,
      circuitBreakerOpenCount: 0,
      circuitBreakerHalfOpenCount: 0,
      sanitizationOperations: 0,
      piiPatternsDetected: 0,
      sdkInitializedAt: /* @__PURE__ */ new Date(),
      uptime: 0
    };
  }
  /**
   * Record a log being added to the buffer
   */
  recordLogBuffered() {
    this.metrics.logsBuffered++;
    this.metrics.currentBufferSize++;
    this.updateBufferHighWatermark(this.metrics.currentBufferSize);
  }
  /**
   * Record logs being flushed
   */
  recordLogsFlushed(count) {
    this.metrics.logsFlushed += count;
    this.metrics.currentBufferSize = Math.max(
      0,
      this.metrics.currentBufferSize - count
    );
  }
  /**
   * Record a log being dropped (buffer full)
   */
  recordLogDropped() {
    this.metrics.logsDropped++;
  }
  /**
   * Record a log being retried
   */
  recordLogRetried() {
    this.metrics.logsRetried++;
  }
  /**
   * Update buffer high watermark
   */
  updateBufferHighWatermark(currentSize) {
    if (currentSize > this.metrics.bufferHighWatermark) {
      this.metrics.bufferHighWatermark = currentSize;
    }
  }
  /**
   * Record a flush attempt
   */
  recordFlushStart() {
    this.metrics.totalFlushes++;
    return Date.now();
  }
  /**
   * Record a successful flush
   */
  recordFlushSuccess(startTime) {
    this.metrics.successfulFlushes++;
    this.metrics.lastSuccessfulFlushAt = /* @__PURE__ */ new Date();
    this.recordFlushDuration(startTime);
    this.updateFlushSuccessRate();
  }
  /**
   * Record a failed flush
   */
  recordFlushFailure(error) {
    this.metrics.failedFlushes++;
    this.updateFlushSuccessRate();
    this.recordError(error);
  }
  /**
   * Record flush duration
   */
  recordFlushDuration(startTime) {
    const duration = Date.now() - startTime;
    this.flushDurations.push(duration);
    if (this.flushDurations.length > 100) {
      this.flushDurations.shift();
    }
    this.metrics.totalFlushDurationMs += duration;
    this.metrics.averageFlushDurationMs = this.metrics.totalFlushDurationMs / this.metrics.totalFlushes;
    if (this.metrics.minFlushDurationMs === 0 || duration < this.metrics.minFlushDurationMs) {
      this.metrics.minFlushDurationMs = duration;
    }
    if (duration > this.metrics.maxFlushDurationMs) {
      this.metrics.maxFlushDurationMs = duration;
    }
    this.metrics.lastFlushAt = /* @__PURE__ */ new Date();
  }
  /**
   * Update flush success rate
   */
  updateFlushSuccessRate() {
    if (this.metrics.totalFlushes === 0) {
      this.metrics.flushSuccessRate = 100;
      return;
    }
    this.metrics.flushSuccessRate = this.metrics.successfulFlushes / this.metrics.totalFlushes * 100;
  }
  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerStateChange(newState) {
    this.metrics.circuitBreakerState = newState;
    this.metrics.circuitBreakerStateChanges++;
    if (newState === "OPEN") {
      this.metrics.circuitBreakerOpenCount++;
    } else if (newState === "HALF_OPEN") {
      this.metrics.circuitBreakerHalfOpenCount++;
    }
  }
  /**
   * Record sanitization operation
   */
  recordSanitization(piiDetected) {
    this.metrics.sanitizationOperations++;
    if (piiDetected) {
      this.metrics.piiPatternsDetected++;
    }
  }
  /**
   * Record an error
   */
  recordError(error) {
    const message = error.message;
    const count = (this.errorCounts.get(message) || 0) + 1;
    this.errorCounts.set(message, count);
    this.metrics.lastError = {
      message,
      timestamp: /* @__PURE__ */ new Date(),
      count
    };
  }
  /**
   * Update current buffer size (called externally)
   */
  updateBufferSize(size) {
    this.metrics.currentBufferSize = size;
    this.updateBufferHighWatermark(size);
  }
  /**
   * Get current health metrics snapshot
   */
  getMetrics() {
    const now = Date.now();
    const initTime = this.metrics.sdkInitializedAt.getTime();
    this.metrics.uptime = Math.floor((now - initTime) / 1e3);
    return JSON.parse(JSON.stringify(this.metrics));
  }
  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.flushDurations = [];
    this.errorCounts.clear();
    this.metrics = {
      logsBuffered: 0,
      logsFlushed: 0,
      logsDropped: 0,
      logsRetried: 0,
      bufferHighWatermark: 0,
      currentBufferSize: 0,
      totalFlushes: 0,
      successfulFlushes: 0,
      failedFlushes: 0,
      flushSuccessRate: 100,
      averageFlushDurationMs: 0,
      minFlushDurationMs: 0,
      maxFlushDurationMs: 0,
      totalFlushDurationMs: 0,
      circuitBreakerState: "CLOSED",
      circuitBreakerStateChanges: 0,
      circuitBreakerOpenCount: 0,
      circuitBreakerHalfOpenCount: 0,
      sanitizationOperations: 0,
      piiPatternsDetected: 0,
      sdkInitializedAt: /* @__PURE__ */ new Date(),
      uptime: 0
    };
  }
  /**
   * Get a human-readable health summary
   */
  getHealthSummary() {
    const metrics = this.getMetrics();
    return `
Apperio SDK Health Metrics
==========================
Uptime: ${metrics.uptime}s
Buffer: ${metrics.currentBufferSize} logs (peak: ${metrics.bufferHighWatermark})

Logs:
  Buffered: ${metrics.logsBuffered}
  Flushed: ${metrics.logsFlushed}
  Dropped: ${metrics.logsDropped}
  Retried: ${metrics.logsRetried}

Flushes:
  Total: ${metrics.totalFlushes}
  Success Rate: ${metrics.flushSuccessRate.toFixed(2)}%
  Avg Duration: ${metrics.averageFlushDurationMs.toFixed(2)}ms
  Min/Max: ${metrics.minFlushDurationMs}ms / ${metrics.maxFlushDurationMs}ms

Circuit Breaker:
  State: ${metrics.circuitBreakerState}
  State Changes: ${metrics.circuitBreakerStateChanges}
  Times Opened: ${metrics.circuitBreakerOpenCount}

Sanitization:
  Operations: ${metrics.sanitizationOperations}
  PII Detected: ${metrics.piiPatternsDetected}

${metrics.lastError ? `Last Error: ${metrics.lastError.message} (occurred ${metrics.lastError.count} times)` : "No errors"}
    `.trim();
  }
};

// src/tracing/propagator.ts
var TracePropagator = class {
  /**
   * Injects trace context fields into a headers object.
   * Returns a new headers object with the trace headers merged in.
   */
  static inject(headers, context) {
    const result = { ...headers };
    result["X-Trace-ID"] = context.traceId;
    result["X-Span-ID"] = context.spanId;
    if (context.parentSpanId) {
      result["X-Parent-Span-ID"] = context.parentSpanId;
    }
    return result;
  }
  /**
   * Extracts a TraceContext from incoming HTTP headers.
   * Header lookup is case-insensitive.
   * Returns null if the required headers (X-Trace-ID, X-Span-ID) are missing.
   */
  static extract(headers) {
    const normalized = {};
    for (const key of Object.keys(headers)) {
      normalized[key.toLowerCase()] = headers[key];
    }
    const traceId = normalized["x-trace-id"];
    const spanId = normalized["x-span-id"];
    if (!traceId || !spanId) {
      return null;
    }
    const parentSpanId = normalized["x-parent-span-id"] || void 0;
    return {
      traceId,
      spanId,
      parentSpanId,
      sampled: true
    };
  }
};

// src/index.ts
var createLogger = (config) => {
  return new Apperio(config);
};

exports.Apperio = Apperio;
exports.AutoInstrumentation = AutoInstrumentation;
exports.BreadcrumbManager = BreadcrumbManager;
exports.CircuitBreaker = CircuitBreaker;
exports.CircuitBreakerState = CircuitBreakerState;
exports.DataSanitizer = DataSanitizer;
exports.HealthMetricsCollector = HealthMetricsCollector;
exports.LogLevel = LogLevel;
exports.OfflineManager = OfflineManager;
exports.PII_PATTERNS = PII_PATTERNS;
exports.PatternDetector = PatternDetector;
exports.RemoteConfigManager = RemoteConfigManager;
exports.SANITIZATION_PRESETS = SANITIZATION_PRESETS;
exports.Span = Span;
exports.TraceContextManager = TraceContextManager;
exports.TracePropagator = TracePropagator;
exports.compressPayload = compressPayload;
exports.createDataSanitizer = createDataSanitizer;
exports.createLogger = createLogger;
exports.getSessionId = getSessionId;
exports.preparePayloadForTransmission = preparePayloadForTransmission;
exports.uint8ArrayToBase64 = uint8ArrayToBase64;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map
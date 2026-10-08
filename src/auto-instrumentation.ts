// src/auto-instrumentation.ts
import { Apperio } from "./logger";
import {
  LogLevel,
  PerformanceEntry,
  UserInteraction,
  NetworkRequest,
} from "./types";
import {
  extractErrorDetails,
  getElementSelector,
  sanitizeUrl,
  isInBrowser,
} from "./utils";
import { BreadcrumbManager } from "./breadcrumb-manager";

/**
 * An Error for a failure that arrived without one (a cross-origin "Script
 * error.", a rejected string). Its type is read from text like "Uncaught
 * TypeError: ...", and its stack is cleared: a stack captured here would point
 * at the SDK, not at the code that failed.
 */
function errorFromText(text: string): Error {
  const match = /^(?:Uncaught\s+)?([A-Z][A-Za-z]*(?:Error|Exception)):\s*([\s\S]*)$/.exec(text);
  const error = new Error(match ? match[2] : text);
  if (match) error.name = match[1];
  error.stack = undefined;
  return error;
}

/** Log line for a captured error, e.g. "TypeError: Cannot read properties of undefined". */
function describeError(error: Error, fallback = "Uncaught error"): string {
  const name = error.name || "Error";
  const message = (error.message || "").split("\n")[0];
  if (!message) return name === "Error" ? fallback : name;
  return message.startsWith(`${name}:`) ? message : `${name}: ${message}`;
}

export class AutoInstrumentation {
  private logger: Apperio;
  private originalFetch?: typeof fetch;
  private originalFetchUnbound?: typeof fetch;
  private originalXHROpen?: typeof XMLHttpRequest.prototype.open;
  private originalXHRSend?: typeof XMLHttpRequest.prototype.send;
  private originalConsoleError?: typeof console.error;
  private originalConsoleWarn?: typeof console.warn;
  private originalConsoleLog?: typeof console.log;
  private originalConsoleInfo?: typeof console.info;
  private originalConsoleDebug?: typeof console.debug;
  private performanceObserver?: PerformanceObserver;
  private breadcrumbManager: BreadcrumbManager;
  private webVitalObservers: PerformanceObserver[] = [];
  // Stored listener references for cleanup
  private _errorHandler?: (event: ErrorEvent) => void;
  private _rejectionHandler?: (event: PromiseRejectionEvent) => void;
  private _clickHandler?: (event: MouseEvent) => void;
  private _scrollHandler?: () => void;
  private _focusHandler?: (event: FocusEvent) => void;
  private _blurHandler?: (event: FocusEvent) => void;
  private _keypressHandler?: (event: KeyboardEvent) => void;
  private _popstateHandler?: () => void;
  private _originalPushState?: typeof history.pushState;
  private _originalReplaceState?: typeof history.replaceState;

  constructor(logger: Apperio) {
    this.logger = logger;
    this.breadcrumbManager = new BreadcrumbManager();
  }

  public init(config: {
    errors?: boolean;
    performance?: boolean;
    userInteractions?: boolean;
    networkRequests?: boolean;
    consoleMessages?: boolean;
    pageViews?: boolean;
  }): void {
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

  private setupErrorCapture(): void {
    // Global error handler
    this._errorHandler = (event: ErrorEvent) => {
      // Report the thrown error itself, not the event wrapping it: the event has
      // no stack and a generic name, which merged every uncaught error into one
      // "Uncaught Error" group. Cross-origin scripts give no error object, only
      // a message, so build one and keep the location in `source`.
      const error =
        event.error instanceof Error
          ? event.error
          : errorFromText(event.message || "Script error");
      const errorDetails = extractErrorDetails(error);

      this.logger._log(LogLevel.ERROR, describeError(error), error, {
        eventType: "error",
        error: errorDetails,
        source: {
          url: event.filename || undefined,
          lineNumber: event.lineno || undefined,
          columnNumber: event.colno || undefined,
        },
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        breadcrumbs: this.breadcrumbManager.getAll(),
        environment: this.breadcrumbManager.captureEnvironment(),
      });
    };
    window.addEventListener("error", this._errorHandler);

    // Unhandled promise rejection handler
    this._rejectionHandler = (event: PromiseRejectionEvent) => {
      const error =
        event.reason instanceof Error
          ? event.reason
          : errorFromText(String(event.reason));
      const errorDetails = extractErrorDetails(error);

      this.logger._log(
        LogLevel.ERROR,
        describeError(error, "Unhandled promise rejection"),
        error,
        {
          eventType: "error",
          error: errorDetails,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
          breadcrumbs: this.breadcrumbManager.getAll(),
          environment: this.breadcrumbManager.captureEnvironment(),
        }
      );
    };
    window.addEventListener("unhandledrejection", this._rejectionHandler);
  }

  private setupPerformanceCapture(): void {
    if (!("PerformanceObserver" in window)) {
      console.warn("AutoInstrumentation: PerformanceObserver not supported");
      return;
    }

    const sdkEndpoint = this.logger.getEndpoint();

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();

        entries.forEach((entry) => {
          // Skip the SDK's own uploads (logs, replay segments). Each one would
          // otherwise be logged, and that log uploaded, in an endless loop.
          if (entry.entryType === "resource" && entry.name.startsWith(sdkEndpoint)) {
            return;
          }

          const perfEntry: PerformanceEntry = {
            name: entry.name,
            type: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration,
          };

          // Add size for resource entries
          if ("transferSize" in entry) {
            perfEntry.size = (entry as any).transferSize;
          }

          // Smart log level based on performance thresholds
          let level = LogLevel.DEBUG;
          let message = "Performance Entry";

          if (entry.entryType === "navigation") {
            if (entry.duration > 3000) {
              level = LogLevel.WARN;
              message = "Slow Page Load";
            } else if (entry.duration > 1000) {
              level = LogLevel.INFO;
              message = "Page Load Performance";
            }
          } else if (entry.entryType === "resource") {
            if (entry.duration > 3000) {
              level = LogLevel.WARN;
              message = "Slow Resource Load";
            } else if (
              entry.name.includes(".css") ||
              entry.name.includes(".js")
            ) {
              if (entry.duration > 1000) {
                level = LogLevel.INFO;
                message = "Critical Resource Load";
              }
            }
          } else if (entry.entryType === "paint") {
            if (entry.duration > 2000) {
              level = LogLevel.WARN;
              message = "Slow Paint";
            } else if (entry.duration > 1000) {
              level = LogLevel.INFO;
              message = "Paint Performance";
            }
          }

          this.logger._log(level, message, undefined, {
            eventType: "performance",
            performance: perfEntry,
            url: window.location.href,
            timestamp: Date.now(),
          });
        });
      });

      // Observe different types of performance entries
      this.performanceObserver.observe({
        entryTypes: ["navigation", "resource", "measure", "paint"],
      });
    } catch (error) {
      console.warn(
        "AutoInstrumentation: Failed to setup performance observer:",
        error
      );
    }
  }

  private setupUserInteractionCapture(): void {
    const captureInteraction = (
      type: UserInteraction["type"],
      event: Event
    ) => {
      const target = event.target as Element;
      if (!target) return;

      const interaction: UserInteraction = {
        type,
        target: getElementSelector(target),
        timestamp: Date.now(),
      };

      if (event instanceof MouseEvent) {
        interaction.coordinates = { x: event.clientX, y: event.clientY };
      }

      // Smart log levels for different interaction types
      let level = LogLevel.DEBUG;
      if (type === "scroll" || type === "keypress") {
        level = LogLevel.TRACE; // Very frequent, lowest priority
      }

      this.logger._log(level, `User ${type}`, undefined, {
        eventType: "interaction",
        interaction,
        url: window.location.href,
        timestamp: Date.now(),
      });
    };

    // Click events
    this._clickHandler = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target) {
        this.breadcrumbManager.add({
          timestamp: Date.now(),
          category: 'ui',
          message: 'User click',
          level: 'debug',
          data: {
            target: getElementSelector(target),
            coordinates: { x: event.clientX, y: event.clientY },
          },
        });
      }
      captureInteraction("click", event);
    };
    document.addEventListener("click", this._clickHandler as EventListener, true);

    // Scroll events (throttled)
    let scrollTimeout: number;
    this._scrollHandler = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        captureInteraction("scroll", new Event("scroll"));
      }, 100);
    };
    document.addEventListener("scroll", this._scrollHandler, true);

    // Focus/blur events
    this._focusHandler = (event: FocusEvent) => captureInteraction("focus", event);
    this._blurHandler = (event: FocusEvent) => captureInteraction("blur", event);
    document.addEventListener("focus", this._focusHandler as EventListener, true);
    document.addEventListener("blur", this._blurHandler as EventListener, true);

    // Keypress events (throttled and sanitized)
    let keypressTimeout: number;
    this._keypressHandler = (event: KeyboardEvent) => {
      clearTimeout(keypressTimeout);
      keypressTimeout = window.setTimeout(() => {
        captureInteraction("keypress", event);
      }, 100);
    };
    document.addEventListener("keypress", this._keypressHandler as EventListener, true);
  }

  private setupNetworkCapture(): void {
    const sdkEndpoint = this.logger.getEndpoint();

    // Patch fetch
    if (window.fetch) {
      this.originalFetchUnbound = window.fetch;
      this.originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const startTime = performance.now();

        // Extract URL from different input types
        let url: string;
        if (typeof args[0] === "string") {
          url = args[0];
        } else if (args[0] instanceof URL) {
          url = args[0].toString();
        } else if (args[0] instanceof Request) {
          url = args[0].url;
        } else {
          url = String(args[0]);
        }

        // Skip SDK's own requests to avoid feedback loop
        if (url.startsWith(sdkEndpoint)) {
          return this.originalFetch!(...args);
        }

        // Extract method from Request object or options
        let method: string;
        if (args[0] instanceof Request) {
          method = args[0].method;
        } else {
          method = args[1]?.method || "GET";
        }

        try {
          const response = await this.originalFetch!(...args);
          const duration = performance.now() - startTime;

          const networkRequest: NetworkRequest = {
            url: sanitizeUrl(url),
            method,
            status: response.status,
            duration,
            timestamp: Date.now(),
          };

          // Smart log level based on status and performance
          let level = LogLevel.DEBUG;
          let message = "Network Request";

          if (response.status >= 500) {
            level = LogLevel.ERROR;
            message = "Server Error";
          } else if (response.status >= 400) {
            level = LogLevel.WARN;
            message = "Client Error";
          } else if (duration > 5000) {
            level = LogLevel.WARN;
            message = "Slow Network Request";
          }

          this.breadcrumbManager.add({
            timestamp: Date.now(),
            category: 'network',
            message: 'Network Request',
            level: response.status >= 400 ? 'error' : 'info',
            data: { url: sanitizeUrl(url), method, status: response.status, duration },
          });

          this.logger._log(level, message, undefined, {
            eventType: "network",
            network: networkRequest,
            timestamp: Date.now(),
          });

          return response;
        } catch (error) {
          const duration = performance.now() - startTime;

          const networkRequest: NetworkRequest = {
            url: sanitizeUrl(url),
            method,
            duration,
            timestamp: Date.now(),
          };

          this.breadcrumbManager.add({
            timestamp: Date.now(),
            category: 'network',
            message: 'Network Request Failed',
            level: 'error',
            data: { url: sanitizeUrl(url), method, duration },
          });

          this.logger._log(
            LogLevel.ERROR,
            "Network Request Failed",
            error as Error,
            {
              eventType: "network",
              network: networkRequest,
              timestamp: Date.now(),
            }
          );

          throw error;
        }
      };
    }

    // Patch XMLHttpRequest
    if (window.XMLHttpRequest) {
      const XHR = XMLHttpRequest.prototype;
      this.originalXHROpen = XHR.open;
      this.originalXHRSend = XHR.send;

      // Capture references to avoid 'this' context issues
      const originalXHROpen = this.originalXHROpen;
      const originalXHRSend = this.originalXHRSend;
      const logger = this.logger;
      const breadcrumbMgr = this.breadcrumbManager;

      XHR.open = function (
        method: string,
        url: string,
        async?: boolean,
        user?: string | null,
        password?: string | null
      ) {
        (this as any)._loggerData = {
          method,
          url,
          startTime: performance.now(),
          isSDKRequest: typeof url === 'string' && url.startsWith(sdkEndpoint),
        };
        return originalXHROpen?.call(
          this,
          method,
          url,
          async === undefined ? true : async,
          user,
          password
        );
      };

      XHR.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        const data = (this as any)._loggerData;
        if (data && !data.isSDKRequest) {
          this.addEventListener("loadend", () => {
            const duration = performance.now() - data.startTime;

            const networkRequest: NetworkRequest = {
              url: sanitizeUrl(data.url),
              method: data.method,
              status: this.status,
              duration,
              timestamp: Date.now(),
            };

            // Smart log level based on status and performance
            let level = LogLevel.DEBUG;
            let message = "Network Request";

            if (this.status >= 500) {
              level = LogLevel.ERROR;
              message = "Server Error";
            } else if (this.status >= 400) {
              level = LogLevel.WARN;
              message = "Client Error";
            } else if (duration > 5000) {
              level = LogLevel.WARN;
              message = "Slow Network Request";
            }

            breadcrumbMgr.add({
              timestamp: Date.now(),
              category: 'network',
              message: 'Network Request',
              level: this.status >= 400 ? 'error' : 'info',
              data: { url: sanitizeUrl(data.url), method: data.method, status: this.status, duration },
            });

            logger._log(level, message, undefined, {
              eventType: "network",
              network: networkRequest,
              timestamp: Date.now(),
            });
          });
        }

        return originalXHRSend?.call(this, body);
      };
    }
  }

  private setupConsoleCapture(): void {
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    this.originalConsoleLog = console.log;
    this.originalConsoleInfo = console.info;
    this.originalConsoleDebug = console.debug;

    console.error = (...args: any[]) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: 'console',
        message: 'Console Error',
        level: 'error',
        data: { args: args.map((arg) => String(arg)) },
      });

      this.logger._log(LogLevel.ERROR, "Console Error", undefined, {
        eventType: "console",
        consoleMethod: "error",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now(),
      });

      return this.originalConsoleError?.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: 'console',
        message: 'Console Warning',
        level: 'warning',
        data: { args: args.map((arg) => String(arg)) },
      });

      this.logger._log(LogLevel.WARN, "Console Warning", undefined, {
        eventType: "console",
        consoleMethod: "warn",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now(),
      });

      return this.originalConsoleWarn?.apply(console, args);
    };

    console.log = (...args: any[]) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: 'console',
        message: 'Console Log',
        level: 'info',
        data: { args: args.map((arg) => String(arg)) },
      });

      this.logger._log(LogLevel.INFO, "Console Log", undefined, {
        eventType: "console",
        consoleMethod: "log",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now(),
      });

      return this.originalConsoleLog?.apply(console, args);
    };

    console.info = (...args: any[]) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: 'console',
        message: 'Console Info',
        level: 'info',
        data: { args: args.map((arg) => String(arg)) },
      });

      this.logger._log(LogLevel.INFO, "Console Info", undefined, {
        eventType: "console",
        consoleMethod: "info",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now(),
      });

      return this.originalConsoleInfo?.apply(console, args);
    };

    console.debug = (...args: any[]) => {
      this.breadcrumbManager.add({
        timestamp: Date.now(),
        category: 'console',
        message: 'Console Debug',
        level: 'debug',
        data: { args: args.map((arg) => String(arg)) },
      });

      this.logger._log(LogLevel.DEBUG, "Console Debug", undefined, {
        eventType: "console",
        consoleMethod: "debug",
        consoleArgs: args.map((arg) => String(arg)),
        url: window.location.href,
        timestamp: Date.now(),
      });

      return this.originalConsoleDebug?.apply(console, args);
    };
  }

  private setupPageViewCapture(): void {
    // Initial page view
    this.capturePageView();

    // History API changes (SPA navigation)
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    const self = this;
    history.pushState = function (...args) {
      self._originalPushState!.apply(history, args);
      setTimeout(() => self.capturePageView(), 0);
    };

    history.replaceState = function (...args) {
      self._originalReplaceState!.apply(history, args);
      setTimeout(() => self.capturePageView(), 0);
    };

    // Popstate events (back/forward)
    this._popstateHandler = () => {
      setTimeout(() => this.capturePageView(), 0);
    };
    window.addEventListener("popstate", this._popstateHandler);
  }

  private capturePageView(): void {
    this.breadcrumbManager.add({
      timestamp: Date.now(),
      category: 'navigation',
      message: 'Page View',
      level: 'info',
      data: { url: window.location.href, title: document.title },
    });

    this.logger._log(LogLevel.INFO, "Page View", undefined, {
      eventType: "pageview",
      url: window.location.href,
      referrer: document.referrer,
      title: document.title,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
    });
  }

  private setupWebVitalsCapture(): void {
    if (!("PerformanceObserver" in window)) {
      return;
    }

    // LCP (Largest Contentful Paint)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        const value = lastEntry.startTime;
        const rating = this.getVitalRating('LCP', value);
        let level = LogLevel.DEBUG;
        if (value > 4000) level = LogLevel.WARN;
        else if (value > 2500) level = LogLevel.INFO;
        this.logger._log(level, 'Web Vital: LCP', undefined, {
          eventType: 'web-vital',
          vital: { name: 'LCP', value, rating },
          timestamp: Date.now(),
        });
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      this.webVitalObservers.push(lcpObserver);
    } catch (e) { /* not supported */ }

    // CLS (Cumulative Layout Shift)
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        const rating = this.getVitalRating('CLS', clsValue);
        let level = LogLevel.DEBUG;
        if (clsValue > 0.25) level = LogLevel.WARN;
        else if (clsValue > 0.1) level = LogLevel.INFO;
        this.logger._log(level, 'Web Vital: CLS', undefined, {
          eventType: 'web-vital',
          vital: { name: 'CLS', value: clsValue, rating },
          timestamp: Date.now(),
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      this.webVitalObservers.push(clsObserver);
    } catch (e) { /* not supported */ }

    // INP (Interaction to Next Paint)
    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.duration;
          const rating = this.getVitalRating('INP', duration);
          let level = LogLevel.DEBUG;
          if (duration > 500) level = LogLevel.WARN;
          else if (duration > 200) level = LogLevel.INFO;
          this.logger._log(level, 'Web Vital: INP', undefined, {
            eventType: 'web-vital',
            vital: { name: 'INP', value: duration, rating },
            timestamp: Date.now(),
          });
        }
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
      this.webVitalObservers.push(inpObserver);
    } catch (e) { /* not supported */ }
  }

  private getVitalRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds: Record<string, [number, number]> = {
      'LCP': [2500, 4000],
      'CLS': [0.1, 0.25],
      'INP': [200, 500],
      'FID': [100, 300],
    };
    const [good, poor] = thresholds[name] || [0, 0];
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
  }

  public destroy(): void {
    // Restore original functions
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

    // Disconnect all web vital observers
    for (const observer of this.webVitalObservers) {
      observer.disconnect();
    }
    this.webVitalObservers = [];

    // Remove error listeners
    if (this._errorHandler) {
      window.removeEventListener("error", this._errorHandler);
    }
    if (this._rejectionHandler) {
      window.removeEventListener("unhandledrejection", this._rejectionHandler);
    }

    // Remove interaction listeners
    if (this._clickHandler) {
      document.removeEventListener("click", this._clickHandler as EventListener, true);
    }
    if (this._scrollHandler) {
      document.removeEventListener("scroll", this._scrollHandler, true);
    }
    if (this._focusHandler) {
      document.removeEventListener("focus", this._focusHandler as EventListener, true);
    }
    if (this._blurHandler) {
      document.removeEventListener("blur", this._blurHandler as EventListener, true);
    }
    if (this._keypressHandler) {
      document.removeEventListener("keypress", this._keypressHandler as EventListener, true);
    }

    // Remove popstate listener and restore History API
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
}

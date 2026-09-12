// src/logger.ts
import { LoggerConfig, LogEntry, LogLevel } from './types';
import { delay, getExponentialBackoffDelay, shouldLog, extractErrorDetails, isInBrowser, getSessionId } from './utils';
import { AutoInstrumentation } from './auto-instrumentation';
import { DataSanitizer, SanitizationConfig, createDataSanitizer, SANITIZATION_PRESETS } from './data-sanitizer';
import { OfflineManager } from './offline-manager';
import { RemoteConfigManager, RemoteSDKConfig } from './remote-config';
import { TraceContextManager, TraceContext } from './tracing/trace-context';
import { Span } from './tracing/span';
import { PatternDetector } from './pattern-detector';

export class Apperio {
  private static readonly MAX_BUFFER_SIZE = 1000;

  private _config: Required<LoggerConfig>;
  private _logBuffer: LogEntry[] = [];
  private _context: Record<string, any> = {};
  private _flushTimer: ReturnType<typeof setInterval> | null = null;
  private _isFlushing: boolean = false;
  private _isShuttingDown: boolean = false;
  private _initialized: boolean = false;
  private _headers: Record<string, string>;
  private _autoInstrumentation: AutoInstrumentation;
  private _dataSanitizer: DataSanitizer;
  private _beforeUnloadHandler: (() => void) | null = null;
  private _offlineManager: OfflineManager | null = null;
  private _remoteConfigManager: RemoteConfigManager | null = null;
  private _traceContextManager: TraceContextManager | null = null;
  private _patternDetector: PatternDetector | null = null;
  private _lastTimestamp: string = '';
  private _timestampCounter: number = 0;

  constructor(config: LoggerConfig) {
    // Apply default values to the configuration
    this._config = {
      endpoint: 'https://apperioserver.onrender.com/api/v1',
      minLogLevel: LogLevel.INFO,
      batchSize: 10,
      flushIntervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
      environment: 'development',
      serviceName: 'unknown-service',
      serviceVersion: '1.0.0',
      ...config,
      // Merge autoCapture with defaults
      autoCapture: {
        errors: true,
        performance: true,
        userInteractions: false,
        networkRequests: true,
        consoleMessages: false,
        pageViews: true,
        ...(config.autoCapture || {}),
      },
      // Merge sanitization with defaults
      sanitization: {
        enabled: true,
        ...(config.sanitization || {}),
      },
      // Phase 2 defaults
      release: config.release || '',
      offline: config.offline || {},
      remoteConfig: config.remoteConfig || {},
      tracing: {
        enabled: false,
        autoTraceNetworkRequests: false,
        ...(config.tracing || {}),
      },
      enablePatternDetection: config.enablePatternDetection !== false,
      onPatternDetected: config.onPatternDetected || undefined,
    } as Required<LoggerConfig>;

    // Validate required configuration
    if (!this._config.apiKey) {
      throw new Error('Apperio: API Key is required.');
    }
    if (!this._config.projectId) {
      throw new Error('Apperio: Project ID is required.');
    }

    this._headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this._config.apiKey,
    };



    // Initialize auto-instrumentation
    this._autoInstrumentation = new AutoInstrumentation(this);

    // Initialize data sanitizer
    const sanitizationConfig = config.sanitization?.config || {};
    this._dataSanitizer = createDataSanitizer(sanitizationConfig);

    this.init();
  }

  public isInitialized(): boolean {
    return this._initialized;
  }

  public init(): void {
    if (this._initialized) {
      console.warn('Apperio: Already initialized. Call shutdown() first to re-initialize.');
      return;
    }

    this._initialized = true;

    if (this._flushTimer) {
      clearInterval(this._flushTimer);
    }

    this._flushTimer = setInterval(() => {
      this.flush();
    }, this._config.flushIntervalMs);

    // Initialize auto-instrumentation if in browser
    if (isInBrowser()) {
      this._autoInstrumentation.init(this._config.autoCapture);

      // Add browser context
      this.setContext({
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
      });

      // Add beforeunload handler to flush logs (store reference for cleanup)
      this._beforeUnloadHandler = () => {
        this.flush();
      };
      window.addEventListener('beforeunload', this._beforeUnloadHandler);
    } else {
      // Add Node.js context
      this.setContext({
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      });

      // Add process exit handlers
      process.on('exit', () => {
        this.flush();
      });

      process.on('SIGINT', async () => {
        await this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.shutdown();
        process.exit(0);
      });
    }

    // --- Phase 2: Offline Support ---
    if (this._config.offline) {
      this._offlineManager = new OfflineManager(this._config.offline);
      this._offlineManager.setFlushCallback(async (logs) => {
        await this._sendLogs(logs);
      });
    }

    // --- Phase 2: Distributed Tracing ---
    if (this._config.tracing?.enabled) {
      this._traceContextManager = new TraceContextManager();
    }

    // --- Phase 3: Pattern Detection ---
    if (this._config.enablePatternDetection) {
      this._patternDetector = new PatternDetector();
    }

    // --- Phase 2: Remote Configuration ---
    if (this._config.remoteConfig?.enabled) {
      this._remoteConfigManager = new RemoteConfigManager(
        this._config.projectId,
        this._config.apiKey,
        this._config.endpoint,
        this._config.remoteConfig,
      );
      this._remoteConfigManager.setApplyCallback((config) => {
        this._applyRemoteConfig(config);
      });
      this._remoteConfigManager.startPeriodicRefresh();
    }
  }

  public setContext(context: Record<string, any>): void {
    this._context = { ...this._context, ...context };
  }

  public getContext(): Record<string, any> {
    return { ...this._context }
  }

  public clearContext(): void {
    this._context = {};
  }

  public getEndpoint(): string {
    return this._config.endpoint;
  }

  public _log(level: LogLevel, message: string, error?: Error, data?: Record<string, any>): void {
    if (this._isShuttingDown) {
      console.warn(`Apperio: Attempted to log "${message}" during shutdown. Log ignored.`);
      return;
    }

    if (!shouldLog(level, this._config.minLogLevel)) {
      return;
    }

    // Monotonic timestamp: ensure at least 1ms difference between logs
    let timestamp = new Date().toISOString();
    if (timestamp === this._lastTimestamp) {
      this._timestampCounter++;
      const adjusted = new Date(new Date(timestamp).getTime() + this._timestampCounter);
      timestamp = adjusted.toISOString();
    } else {
      this._lastTimestamp = timestamp;
      this._timestampCounter = 0;
    }

    const logEntry: LogEntry = {
      projectId: this._config.projectId,
      timestamp,
      level: level,
      message: message,
      data: data,
      error: error ? extractErrorDetails(error) : undefined,
      service: this._config.serviceName,
      environment: this._config.environment,
      context: { ...this._context },
      sessionId: getSessionId(),
    };

    // Extract eventType from data to top-level field for backend indexing
    if (data?.eventType) {
      logEntry.eventType = data.eventType;
    }

    // Attach release version if configured
    if (this._config.release) {
      logEntry.release = this._config.release;
    }

    // Attach trace context if tracing is active
    if (this._traceContextManager) {
      const trace = this._traceContextManager.getCurrentTrace();
      if (trace) {
        logEntry.traceId = trace.traceId;
        logEntry.spanId = trace.spanId;
      }
    }

    // Add browser-specific fields if available
    if (isInBrowser()) {
      logEntry.userAgent = navigator.userAgent;
      logEntry.url = window.location.href;
      logEntry.referrer = document.referrer;
    }

    // Apply data sanitization if enabled
    const sanitizedEntry = this._config.sanitization?.enabled !== false
      ? this._dataSanitizer.sanitizeLogEntry(logEntry)
      : logEntry;

    // Route to offline queue when offline
    if (this._offlineManager && !this._offlineManager.isOnline()) {
      this._offlineManager.enqueue(sanitizedEntry);
      return;
    }

    // Same-batch deduplication: skip if buffer already has identical message + timestamp
    const isDuplicate = this._logBuffer.some(
      (existing) =>
        existing.message === sanitizedEntry.message &&
        existing.timestamp === sanitizedEntry.timestamp
    );
    if (isDuplicate) return;

    this._logBuffer.push(sanitizedEntry);

    // Feed errors to pattern detector
    if (
      this._patternDetector &&
      (level === LogLevel.ERROR || level === LogLevel.FATAL)
    ) {
      const errorMsg = error?.message || message;
      this._patternDetector.recordError(errorMsg);

      // Check for new patterns and auto-log them
      const patterns = this._patternDetector.getPatterns();
      for (const pattern of patterns) {
        // Invoke user callback if provided
        if (this._config.onPatternDetected) {
          try {
            this._config.onPatternDetected(pattern);
          } catch {
            // Silently ignore callback errors
          }
        }

        const patternEntry: LogEntry = {
          projectId: this._config.projectId,
          timestamp: new Date().toISOString(),
          level: LogLevel.WARN,
          message: `[Pattern Detection] ${pattern.type}: ${pattern.message}`,
          data: {
            patternType: pattern.type,
            count: pattern.count,
            windowMs: pattern.windowMs,
          },
          service: this._config.serviceName,
          environment: this._config.environment,
          eventType: 'message',
          context: { ...this._context },
          sessionId: getSessionId(),
        };
        this._logBuffer.push(patternEntry);
      }
    }

    // Prevent unbounded buffer growth
    if (this._logBuffer.length > Apperio.MAX_BUFFER_SIZE) {
      const dropped = this._logBuffer.length - Apperio.MAX_BUFFER_SIZE;
      this._logBuffer = this._logBuffer.slice(-Apperio.MAX_BUFFER_SIZE);
      console.warn(`Apperio: Dropped ${dropped} oldest logs due to buffer overflow.`);
    }

    if (this._logBuffer.length >= this._config.batchSize) {
      this.flush();
    }
  }

  public trace(message: string, data?: Record<string, any>): void {
    this._log(LogLevel.TRACE, message, undefined, data);
  }

  public debug(message: string, data?: Record<string, any>): void {
    this._log(LogLevel.DEBUG, message, undefined, data);
  }

  public info(message: string, data?: Record<string, any>): void {
    this._log(LogLevel.INFO, message, undefined, data);
  }

  public warn(message: string, data?: Record<string, any>): void {
    this._log(LogLevel.WARN, message, undefined, data);
  }

  public error(message: string, error?: Error, data?: Record<string, any>): void {
    this._log(LogLevel.ERROR, message, error, data);
  }

  public fatal(message: string, error?: Error, data?: Record<string, any>): void {
    this._log(LogLevel.FATAL, message, error, data);
  }

  // Enhanced methods for specific event types
  public captureException(error: Error, context?: Record<string, any>): void {
    const previousContext = { ...this._context };
    if (context) {
      this._context = { ...this._context, ...context };
    }
    this._log(LogLevel.ERROR, 'Exception captured', error, {
      eventType: 'error',
    });
    if (context) {
      this._context = previousContext;
    }
  }

  public captureMessage(message: string, level: LogLevel = LogLevel.INFO, context?: Record<string, any>): void {
    const previousContext = { ...this._context };
    if (context) {
      this._context = { ...this._context, ...context };
    }
    this._log(level, message, undefined, {
      eventType: 'message',
    });
    if (context) {
      this._context = previousContext;
    }
  }

  public addBreadcrumb(message: string, category?: string, data?: Record<string, any>): void {
    this._log(LogLevel.DEBUG, message, undefined, {
      eventType: 'breadcrumb',
      category,
      ...data,
    });
  }

  public async flush(): Promise<void> {
    if (this._isFlushing || this._logBuffer.length === 0) {
      return;
    }

    this._isFlushing = true;
    const logsToSend = [...this._logBuffer];
    this._logBuffer = [];

    try {
      await this._sendLogs(logsToSend);
    } catch (err) {
      console.error('Apperio: Failed to send logs after retries. Re-adding to buffer.', err);
      this._logBuffer.unshift(...logsToSend);
      // Prevent unbounded buffer growth
      if (this._logBuffer.length > Apperio.MAX_BUFFER_SIZE) {
        const dropped = this._logBuffer.length - Apperio.MAX_BUFFER_SIZE;
        this._logBuffer = this._logBuffer.slice(0, Apperio.MAX_BUFFER_SIZE);
        console.warn(`Apperio: Dropped ${dropped} oldest logs due to buffer overflow.`);
      }
    } finally {
      this._isFlushing = false;
    }
  }

  private async _sendLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    const url = `${this._config.endpoint}/${this._config.projectId}/logs/batch`;

    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this._headers,
          body: JSON.stringify({ logs }),
        });

        if (response.ok) {
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          if (response.status === 401 || response.status === 403) {
            console.error('Apperio: Authentication/Authorization failed. Check API Key.');
          }
          throw new Error(`Apperio: Non-retryable API error: ${response.status}`);
        }

        console.warn(`Apperio: API returned status ${response.status} on attempt ${attempt + 1}.`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Apperio: Non-retryable')) {
          throw error;
        }
        console.error(`Apperio: Network error on attempt ${attempt + 1}:`, (error as Error).message);
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
  public getSanitizationConfig(): import('./data-sanitizer').SanitizationConfig {
    return this._dataSanitizer.getConfig();
  }

  public updateSanitizationConfig(config: Partial<import('./data-sanitizer').SanitizationConfig>): void {
    this._dataSanitizer.updateConfig(config);
  }

  public getAuditTrail(): import('./data-sanitizer').AuditEntry[] {
    return this._dataSanitizer.getAuditTrail();
  }

  public clearAuditTrail(): void {
    this._dataSanitizer.clearAuditTrail();
  }

  public cleanupExpiredData(): number {
    return this._dataSanitizer.cleanupExpiredData();
  }

  public addCustomSanitizationRule(rule: import('./data-sanitizer').SanitizationRule): void {
    this._dataSanitizer.addCustomRule(rule);
  }

  public removeCustomSanitizationRule(description: string): boolean {
    return this._dataSanitizer.removeCustomRule(description);
  }

  // --- Distributed Tracing API ---

  public startTrace(name: string): TraceContext | null {
    if (!this._traceContextManager) {
      return null;
    }
    return this._traceContextManager.startTrace(name);
  }

  public endTrace(): void {
    this._traceContextManager?.endTrace();
  }

  public getCurrentTrace(): TraceContext | null {
    return this._traceContextManager?.getCurrentTrace() ?? null;
  }

  public createChildSpan(name: string): Span | null {
    if (!this._traceContextManager) {
      return null;
    }
    return this._traceContextManager.createChildSpan(name);
  }

  // --- Remote Configuration ---

  private _applyRemoteConfig(config: RemoteSDKConfig): void {
    if (config.minLogLevel) {
      this._config.minLogLevel = config.minLogLevel;
    }
    if (config.batchSize !== undefined) {
      this._config.batchSize = config.batchSize;
    }
    if (config.flushIntervalMs !== undefined) {
      this._config.flushIntervalMs = config.flushIntervalMs;
      // Restart flush timer with new interval
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

  public async shutdown(): Promise<void> {
    this._isShuttingDown = true;

    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }

    // Cleanup data sanitizer
    this.cleanupExpiredData();

    // Cleanup auto-instrumentation
    this._autoInstrumentation.destroy();

    // Cleanup Phase 2 managers
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

    // Remove beforeunload handler
    if (isInBrowser() && this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }

    console.log('Apperio: Shutting down. Flushing remaining logs...');
    await this.flush();
    console.log('Apperio: Shutdown complete.');

    this._initialized = false;
    this._isShuttingDown = false;
  }
}
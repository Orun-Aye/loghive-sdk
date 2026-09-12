/**
 * Offline Manager
 *
 * Provides in-memory offline log queuing for the Apperio SDK.
 * When the browser goes offline, logs are enqueued and automatically
 * flushed when connectivity is restored.
 *
 * IMPORTANT: Uses in-memory storage ONLY. No localStorage, sessionStorage,
 * or IndexedDB per SDK constraints.
 */

interface OfflineManagerConfig {
    /** Maximum number of logs to hold in the offline queue. @default 500 */
    maxQueueSize?: number;
    /** When queue is full, prefer keeping ERROR/FATAL logs over lower-severity ones. @default true */
    prioritizeCritical?: boolean;
    /** Called after a successful sync of queued logs. */
    onSyncComplete?: (count: number) => void;
    /** Called when the browser transitions to offline. */
    onOffline?: () => void;
    /** Called when the browser transitions to online. */
    onOnline?: () => void;
}
declare class OfflineManager {
    private config;
    private queue;
    private _isOnline;
    private flushCallback;
    private onlineHandler;
    private offlineHandler;
    private _isFlushing;
    constructor(config?: OfflineManagerConfig);
    /**
     * Returns the current online status.
     */
    isOnline(): boolean;
    /**
     * Registers the callback that sends queued logs through the logger's pipeline.
     * Must be called before logs can be flushed.
     */
    setFlushCallback(callback: (logs: LogEntry[]) => Promise<void>): void;
    /**
     * Enqueue a log entry for later transmission.
     *
     * When the queue is full:
     * - If `prioritizeCritical` is enabled, the first non-critical (non ERROR/FATAL)
     *   log is found and evicted to make room. If all entries are critical, the oldest
     *   entry is dropped.
     * - Otherwise, the oldest entry is dropped unconditionally.
     */
    enqueue(log: LogEntry): void;
    /**
     * Returns the number of logs currently queued.
     */
    getQueueSize(): number;
    /**
     * Flush all queued logs through the registered flush callback.
     * Called automatically when the browser comes back online.
     *
     * On flush failure, logs are re-queued (up to maxQueueSize).
     */
    flushOfflineQueue(): Promise<void>;
    /**
     * Tear down listeners and clear internal state.
     */
    destroy(): void;
    private setupListeners;
}

/**
 * Remote Configuration Manager
 *
 * Fetches SDK configuration from the backend at a configurable interval,
 * allowing runtime adjustments to logging behaviour without redeploying
 * the client application.
 *
 * Uses the native `fetch` API (not axios) to avoid circular dependency
 * issues with the logger module.
 */

interface RemoteConfigOptions {
    /** Enable remote configuration fetching. @default false */
    enabled?: boolean;
    /** Interval in milliseconds between config refreshes. @default 300000 (5 min) */
    refreshIntervalMs?: number;
    /** Override the config endpoint URL. Defaults to `${baseEndpoint}/sdk-config/${projectId}` */
    endpoint?: string;
    /** Called whenever a new configuration is successfully fetched. */
    onConfigUpdate?: (config: RemoteSDKConfig) => void;
}
interface RemoteSDKConfig {
    minLogLevel?: LogLevel;
    batchSize?: number;
    flushIntervalMs?: number;
    autoCapture?: {
        errors?: boolean;
        performance?: boolean;
        userInteractions?: boolean;
        networkRequests?: boolean;
        consoleMessages?: boolean;
        pageViews?: boolean;
    };
    sanitization?: {
        preset?: 'STRICT' | 'BALANCED' | 'LENIENT';
    };
}
declare class RemoteConfigManager {
    private projectId;
    private apiKey;
    private baseEndpoint;
    private options;
    private lastConfig;
    private refreshTimer;
    private applyCallback;
    constructor(projectId: string, apiKey: string, baseEndpoint: string, options?: RemoteConfigOptions);
    /**
     * Registers a callback that the logger uses to apply fetched configuration.
     */
    setApplyCallback(callback: (config: RemoteSDKConfig) => void): void;
    /**
     * Fetch the remote SDK configuration from the backend.
     *
     * Returns the parsed config on success, or `null` on any failure.
     * Failures are logged as warnings but never thrown.
     */
    fetchConfig(): Promise<RemoteSDKConfig | null>;
    /**
     * Begin polling the backend for config updates at the configured interval.
     * Performs an initial fetch immediately.
     */
    startPeriodicRefresh(): void;
    /**
     * Stop the periodic refresh timer.
     */
    stopPeriodicRefresh(): void;
    /**
     * Returns the most recently fetched config, or `null` if none has been fetched yet.
     */
    getLastConfig(): RemoteSDKConfig | null;
    /**
     * Clean up all resources held by the manager.
     */
    destroy(): void;
    private getEndpoint;
}

declare enum LogLevel {
    TRACE = "trace",
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    FATAL = "fatal"
}
interface LoggerConfig {
    apiKey: string;
    projectId: string;
    endpoint?: string;
    minLogLevel?: LogLevel;
    batchSize?: number;
    flushIntervalMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    environment?: string;
    serviceName?: string;
    serviceVersion?: string;
    /** Release version string attached to every log entry. */
    release?: string;
    autoCapture?: {
        errors?: boolean;
        performance?: boolean;
        userInteractions?: boolean;
        networkRequests?: boolean;
        consoleMessages?: boolean;
        pageViews?: boolean;
        logLevels?: {
            errors?: LogLevel;
            networkSuccess?: LogLevel;
            networkError?: LogLevel;
            performanceSlow?: LogLevel;
            performanceFast?: LogLevel;
            interactions?: LogLevel;
            pageViews?: LogLevel;
            console?: {
                error?: LogLevel;
                warn?: LogLevel;
                info?: LogLevel;
            };
        };
    };
    sanitization?: {
        enabled?: boolean;
        config?: SanitizationConfig;
    };
    /** Offline queuing configuration. */
    offline?: OfflineManagerConfig;
    /** Remote SDK configuration fetching. */
    remoteConfig?: RemoteConfigOptions;
    /** Distributed tracing configuration. */
    tracing?: {
        enabled?: boolean;
        /** Automatically create spans for network requests. @default false */
        autoTraceNetworkRequests?: boolean;
    };
    /** Enable client-side error pattern detection. @default true */
    enablePatternDetection?: boolean;
    /** Callback invoked when a pattern is detected (recurring error or error spike). */
    onPatternDetected?: (pattern: {
        type: string;
        message: string;
        count: number;
        windowMs: number;
        detectedAt: string;
    }) => void;
}
interface LogEntry {
    projectId: string;
    timestamp?: string;
    level: LogLevel;
    message: string;
    data?: Record<string, any>;
    error?: {
        name: string;
        message: string;
        stack?: string;
        url?: string;
        lineNumber?: number;
        columnNumber?: number;
    };
    service?: string;
    environment?: string;
    context?: Record<string, any>;
    metadata?: any;
    eventType?: 'error' | 'performance' | 'interaction' | 'network' | 'console' | 'pageview' | 'web-vital' | 'breadcrumb' | 'message';
    userAgent?: string;
    url?: string;
    referrer?: string;
    /** Session ID for the current page load. Groups every log from one visit. */
    sessionId?: string;
    /** Distributed trace ID, set when tracing is active. */
    traceId?: string;
    /** Distributed span ID, set when tracing is active. */
    spanId?: string;
    /** Release version string. */
    release?: string;
}
interface PerformanceEntry {
    name: string;
    type: string;
    startTime: number;
    duration: number;
    size?: number;
}
interface UserInteraction {
    type: 'click' | 'scroll' | 'keypress' | 'focus' | 'blur';
    target: string;
    timestamp: number;
    coordinates?: {
        x: number;
        y: number;
    };
}
interface NetworkRequest {
    url: string;
    method: string;
    status?: number;
    duration: number;
    size?: number;
    timestamp: number;
}

/**
 * Data sanitization rules configuration
 */
interface SanitizationRule {
    pattern: RegExp;
    replacement: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'pii' | 'financial' | 'authentication' | 'custom';
}
/**
 * Data retention policy configuration
 */
interface RetentionPolicy {
    maxAge: number;
    maxSize: number;
    autoDelete: boolean;
    archiveBeforeDelete: boolean;
    categories: string[];
}
/**
 * Audit trail entry for data processing
 */
interface AuditEntry {
    timestamp: string;
    operation: 'sanitize' | 'anonymize' | 'retain' | 'delete' | 'archive';
    dataType: string;
    originalSize: number;
    processedSize: number;
    rulesApplied: string[];
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
}
/**
 * PII detection patterns
 */
declare const PII_PATTERNS: SanitizationRule[];
/**
 * Data sanitization configuration
 */
interface SanitizationConfig {
    enabled: boolean;
    rules: SanitizationRule[];
    customRules: SanitizationRule[];
    retentionPolicy: RetentionPolicy;
    auditEnabled: boolean;
    anonymizationEnabled: boolean;
    sensitiveFields: string[];
    preserveStructure: boolean;
}
/**
 * DataSanitizer class for enterprise-grade data sanitization
 */
declare class DataSanitizer {
    private config;
    private auditTrail;
    private retentionCache;
    constructor(config?: Partial<SanitizationConfig>);
    /**
     * Sanitize a log entry by applying all configured rules
     */
    sanitizeLogEntry(logEntry: LogEntry): LogEntry;
    /**
     * Sanitize a string using configured rules
     */
    private sanitizeString;
    /**
     * Sanitize an object recursively
     */
    private sanitizeObject;
    /**
     * Anonymize sensitive fields
     */
    private anonymizeSensitiveFields;
    /**
     * Anonymize a value based on its type
     */
    private anonymizeValue;
    /**
     * Check if data should be retained based on retention policy
     */
    shouldRetainData(dataId: string, timestamp: number, size: number): boolean;
    /**
     * Get data that should be deleted based on retention policy
     */
    getDataForDeletion(): string[];
    /**
     * Clean up expired data
     */
    cleanupExpiredData(): number;
    /**
     * Get audit trail entries
     */
    getAuditTrail(): AuditEntry[];
    /**
     * Clear audit trail
     */
    clearAuditTrail(): void;
    /**
     * Add custom sanitization rule
     */
    addCustomRule(rule: SanitizationRule): void;
    /**
     * Remove custom sanitization rule
     */
    removeCustomRule(description: string): boolean;
    /**
     * Update sanitization configuration
     */
    updateConfig(newConfig: Partial<SanitizationConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): SanitizationConfig;
    /**
     * Calculate approximate size of an object in bytes
     */
    private calculateSize;
    /**
     * Deep clone an object
     */
    private deepClone;
    /**
     * Record an audit entry
     */
    private recordAuditEntry;
}
/**
 * Factory function to create a DataSanitizer with common configurations
 */
declare function createDataSanitizer(config?: Partial<SanitizationConfig>): DataSanitizer;
/**
 * Predefined sanitization configurations for common use cases
 */
declare const SANITIZATION_PRESETS: {
    STRICT: SanitizationConfig;
    BALANCED: SanitizationConfig;
    LENIENT: SanitizationConfig;
};

interface SpanData {
    spanId: string;
    traceId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'ok' | 'error' | 'pending';
    attributes: Record<string, any>;
}
/**
 * Represents a single unit of work within a distributed trace.
 *
 * A span tracks the start time, end time, duration, status, and arbitrary
 * attributes of an operation. Spans can be nested via parentSpanId to form
 * a tree structure within a trace.
 */
declare class Span {
    private data;
    constructor(name: string, traceId: string, parentSpanId?: string);
    /**
     * Sets a key-value attribute on this span.
     */
    setAttribute(key: string, value: any): void;
    /**
     * Ends the span, recording the end time and calculating duration.
     * Returns a frozen copy of the span data.
     */
    end(status?: 'ok' | 'error'): SpanData;
    /**
     * Returns a copy of the current span data without ending the span.
     */
    getData(): SpanData;
}

interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    sampled: boolean;
}
/**
 * Manages the lifecycle of distributed traces.
 *
 * Holds the current trace context and a registry of active spans.
 * Provides methods to start/end traces, create child spans, and
 * produce HTTP headers for trace propagation.
 */
declare class TraceContextManager {
    private currentTrace;
    private activeSpans;
    /**
     * Starts a new trace with the given name.
     * Generates a fresh traceId and root spanId, marks the trace as sampled,
     * and stores it as the current trace context.
     */
    startTrace(name: string): TraceContext;
    /**
     * Ends the current trace, clearing the context and all active spans.
     */
    endTrace(): void;
    /**
     * Returns a copy of the current trace context, or null if no trace is active.
     */
    getCurrentTrace(): TraceContext | null;
    /**
     * Returns HTTP headers for trace propagation.
     * If no trace is active, returns an empty object.
     */
    getTraceHeaders(): Record<string, string>;
    /**
     * Creates a child span under the current trace.
     * The child span's parentSpanId is set to the current trace's spanId.
     * Throws if no trace is active.
     */
    createChildSpan(name: string): Span;
    /**
     * Registers an externally-created span in the active spans registry.
     */
    addSpan(span: Span): void;
    /**
     * Removes a span from the active spans registry by its ID.
     */
    removeSpan(spanId: string): void;
}

declare class Apperio {
    private static readonly MAX_BUFFER_SIZE;
    private _config;
    private _logBuffer;
    private _context;
    private _flushTimer;
    private _isFlushing;
    private _isShuttingDown;
    private _initialized;
    private _headers;
    private _autoInstrumentation;
    private _dataSanitizer;
    private _beforeUnloadHandler;
    private _offlineManager;
    private _remoteConfigManager;
    private _traceContextManager;
    private _patternDetector;
    private _lastTimestamp;
    private _timestampCounter;
    constructor(config: LoggerConfig);
    isInitialized(): boolean;
    init(): void;
    setContext(context: Record<string, any>): void;
    getContext(): Record<string, any>;
    clearContext(): void;
    getEndpoint(): string;
    _log(level: LogLevel, message: string, error?: Error, data?: Record<string, any>): void;
    trace(message: string, data?: Record<string, any>): void;
    debug(message: string, data?: Record<string, any>): void;
    info(message: string, data?: Record<string, any>): void;
    warn(message: string, data?: Record<string, any>): void;
    error(message: string, error?: Error, data?: Record<string, any>): void;
    fatal(message: string, error?: Error, data?: Record<string, any>): void;
    captureException(error: Error, context?: Record<string, any>): void;
    captureMessage(message: string, level?: LogLevel, context?: Record<string, any>): void;
    addBreadcrumb(message: string, category?: string, data?: Record<string, any>): void;
    flush(): Promise<void>;
    private _sendLogs;
    getSanitizationConfig(): SanitizationConfig;
    updateSanitizationConfig(config: Partial<SanitizationConfig>): void;
    getAuditTrail(): AuditEntry[];
    clearAuditTrail(): void;
    cleanupExpiredData(): number;
    addCustomSanitizationRule(rule: SanitizationRule): void;
    removeCustomSanitizationRule(description: string): boolean;
    startTrace(name: string): TraceContext | null;
    endTrace(): void;
    getCurrentTrace(): TraceContext | null;
    createChildSpan(name: string): Span | null;
    private _applyRemoteConfig;
    shutdown(): Promise<void>;
}

declare class AutoInstrumentation {
    private logger;
    private originalFetch?;
    private originalFetchUnbound?;
    private originalXHROpen?;
    private originalXHRSend?;
    private originalConsoleError?;
    private originalConsoleWarn?;
    private originalConsoleLog?;
    private originalConsoleInfo?;
    private originalConsoleDebug?;
    private performanceObserver?;
    private breadcrumbManager;
    private webVitalObservers;
    private _errorHandler?;
    private _rejectionHandler?;
    private _clickHandler?;
    private _scrollHandler?;
    private _focusHandler?;
    private _blurHandler?;
    private _keypressHandler?;
    private _popstateHandler?;
    private _originalPushState?;
    private _originalReplaceState?;
    constructor(logger: Apperio);
    init(config: {
        errors?: boolean;
        performance?: boolean;
        userInteractions?: boolean;
        networkRequests?: boolean;
        consoleMessages?: boolean;
        pageViews?: boolean;
    }): void;
    private setupErrorCapture;
    private setupPerformanceCapture;
    private setupUserInteractionCapture;
    private setupNetworkCapture;
    private setupConsoleCapture;
    private setupPageViewCapture;
    private capturePageView;
    private setupWebVitalsCapture;
    private getVitalRating;
    destroy(): void;
}

/**
 * Returns the session ID for this page load, generating it on first use.
 */
declare function getSessionId(): string;

/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by stopping requests to a failing service
 * and allowing it time to recover.
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Service is failing, all requests are blocked
 * - HALF_OPEN: Testing if service has recovered
 */
declare enum CircuitBreakerState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
interface CircuitBreakerConfig {
    /**
     * Number of consecutive failures before opening the circuit
     * @default 5
     */
    failureThreshold?: number;
    /**
     * Time in milliseconds to wait before attempting recovery (half-open state)
     * @default 30000 (30 seconds)
     */
    cooldownMs?: number;
    /**
     * Optional callback for state transitions
     */
    onStateChange?: (state: CircuitBreakerState, reason: string) => void;
}
declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime;
    private config;
    constructor(config?: CircuitBreakerConfig);
    /**
     * Get current circuit breaker state
     */
    getState(): CircuitBreakerState;
    /**
     * Check if a request should be allowed through
     */
    execute<T>(operation: () => Promise<T>): Promise<{
        success: boolean;
        result?: T;
        error?: Error;
    }>;
    /**
     * Record a successful operation
     */
    private onSuccess;
    /**
     * Record a failed operation
     */
    private onFailure;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Manually reset the circuit breaker to CLOSED state
     */
    reset(): void;
    /**
     * Get current failure count
     */
    getFailureCount(): number;
    /**
     * Get current success count (relevant in HALF_OPEN state)
     */
    getSuccessCount(): number;
    /**
     * Get time until circuit will attempt recovery (OPEN → HALF_OPEN)
     * Returns 0 if not in OPEN state
     */
    getTimeUntilRetry(): number;
    /**
     * Check if circuit breaker is currently allowing requests
     */
    isOpen(): boolean;
    /**
     * Check if circuit breaker is in closed state (normal operation)
     */
    isClosed(): boolean;
    /**
     * Check if circuit breaker is testing recovery
     */
    isHalfOpen(): boolean;
}

interface CompressionResult {
    data: string | Uint8Array;
    compressed: boolean;
    originalSize: number;
    compressedSize: number;
    encoding?: "gzip" | "deflate";
}
/**
 * Compress a JSON payload if it exceeds the minimum size threshold
 */
declare function compressPayload(payload: any, minSize?: number): Promise<CompressionResult>;
/**
 * Convert Uint8Array to base64 string for transmission
 */
declare function uint8ArrayToBase64(uint8Array: Uint8Array): string;
/**
 * Prepare payload for transmission
 * Returns JSON string or base64-encoded compressed data
 */
declare function preparePayloadForTransmission(payload: any, compressionEnabled?: boolean): Promise<{
    data: string;
    headers: Record<string, string>;
    metadata: {
        compressed: boolean;
        originalSize: number;
        compressedSize: number;
        compressionRatio?: number;
    };
}>;

/**
 * SDK Health Metrics
 *
 * Tracks internal SDK performance and reliability metrics
 * for monitoring and debugging purposes.
 */
interface HealthMetrics {
    logsBuffered: number;
    logsFlushed: number;
    logsDropped: number;
    logsRetried: number;
    bufferHighWatermark: number;
    currentBufferSize: number;
    totalFlushes: number;
    successfulFlushes: number;
    failedFlushes: number;
    flushSuccessRate: number;
    averageFlushDurationMs: number;
    minFlushDurationMs: number;
    maxFlushDurationMs: number;
    totalFlushDurationMs: number;
    circuitBreakerState: string;
    circuitBreakerStateChanges: number;
    circuitBreakerOpenCount: number;
    circuitBreakerHalfOpenCount: number;
    sanitizationOperations: number;
    piiPatternsDetected: number;
    sdkInitializedAt: Date;
    lastFlushAt?: Date;
    lastSuccessfulFlushAt?: Date;
    uptime: number;
    lastError?: {
        message: string;
        timestamp: Date;
        count: number;
    };
}
declare class HealthMetricsCollector {
    private metrics;
    private flushDurations;
    private errorCounts;
    constructor();
    /**
     * Record a log being added to the buffer
     */
    recordLogBuffered(): void;
    /**
     * Record logs being flushed
     */
    recordLogsFlushed(count: number): void;
    /**
     * Record a log being dropped (buffer full)
     */
    recordLogDropped(): void;
    /**
     * Record a log being retried
     */
    recordLogRetried(): void;
    /**
     * Update buffer high watermark
     */
    private updateBufferHighWatermark;
    /**
     * Record a flush attempt
     */
    recordFlushStart(): number;
    /**
     * Record a successful flush
     */
    recordFlushSuccess(startTime: number): void;
    /**
     * Record a failed flush
     */
    recordFlushFailure(error: Error): void;
    /**
     * Record flush duration
     */
    private recordFlushDuration;
    /**
     * Update flush success rate
     */
    private updateFlushSuccessRate;
    /**
     * Record circuit breaker state change
     */
    recordCircuitBreakerStateChange(newState: string): void;
    /**
     * Record sanitization operation
     */
    recordSanitization(piiDetected: boolean): void;
    /**
     * Record an error
     */
    private recordError;
    /**
     * Update current buffer size (called externally)
     */
    updateBufferSize(size: number): void;
    /**
     * Get current health metrics snapshot
     */
    getMetrics(): HealthMetrics;
    /**
     * Reset all metrics (useful for testing)
     */
    reset(): void;
    /**
     * Get a human-readable health summary
     */
    getHealthSummary(): string;
}

interface Breadcrumb {
    timestamp: number;
    category: 'ui' | 'navigation' | 'network' | 'console' | 'custom';
    message: string;
    data?: Record<string, any>;
    level: 'debug' | 'info' | 'warning' | 'error';
}
interface EnvironmentSnapshot {
    url: string;
    referrer: string;
    viewport: {
        width: number;
        height: number;
    };
    scrollPosition: {
        x: number;
        y: number;
    };
    networkState: {
        online: boolean;
        connectionType?: string;
    };
    memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
    timestamp: number;
}
declare class BreadcrumbManager {
    private breadcrumbs;
    private maxBreadcrumbs;
    constructor(maxBreadcrumbs?: number);
    /**
     * Add a breadcrumb to the trail.
     * If the trail exceeds maxBreadcrumbs, the oldest entry is removed.
     */
    add(breadcrumb: Breadcrumb): void;
    /**
     * Returns a shallow copy of all breadcrumbs.
     */
    getAll(): Breadcrumb[];
    /**
     * Clears all breadcrumbs.
     */
    clear(): void;
    /**
     * Captures a snapshot of the current browser environment.
     * Gracefully handles missing APIs (e.g., navigator.connection, performance.memory).
     */
    captureEnvironment(): EnvironmentSnapshot;
}

/**
 * Handles injection and extraction of trace context into/from HTTP headers.
 *
 * All methods are static since the propagator is stateless -- it simply
 * maps between TraceContext objects and header key-value pairs.
 *
 * Header names used:
 *   - `X-Trace-ID`   -- the trace identifier
 *   - `X-Span-ID`    -- the current span identifier
 *   - `X-Parent-Span-ID` -- the parent span identifier (optional)
 */
declare class TracePropagator {
    /**
     * Injects trace context fields into a headers object.
     * Returns a new headers object with the trace headers merged in.
     */
    static inject(headers: Record<string, string>, context: TraceContext): Record<string, string>;
    /**
     * Extracts a TraceContext from incoming HTTP headers.
     * Header lookup is case-insensitive.
     * Returns null if the required headers (X-Trace-ID, X-Span-ID) are missing.
     */
    static extract(headers: Record<string, string>): TraceContext | null;
}

/**
 * PatternDetector — Client-side error pattern recognition.
 * Detects recurring errors and error spikes without any external API.
 */
interface DetectedPattern {
    type: "recurring_error" | "error_spike";
    message: string;
    count: number;
    windowMs: number;
    detectedAt: string;
}
declare class PatternDetector {
    private _errors;
    private _maxWindowSize;
    private _recurringThreshold;
    private _recurringWindowMs;
    private _spikeMultiplier;
    private _spikeShortWindowMs;
    private _spikeLongWindowMs;
    private _lastPatternEmit;
    private _throttleMs;
    constructor(options?: {
        maxWindowSize?: number;
        recurringThreshold?: number;
        recurringWindowMs?: number;
        spikeMultiplier?: number;
        spikeShortWindowMs?: number;
        spikeLongWindowMs?: number;
        throttleMs?: number;
    });
    /**
     * Feed an error into the pattern detector.
     */
    recordError(message: string): void;
    /**
     * Detect recurring errors — groups by message similarity,
     * flags groups with threshold+ occurrences in the window.
     */
    detectRecurringErrors(): DetectedPattern[];
    /**
     * Detect error spike — compares last-minute error count
     * against rolling 10-minute average, flags if > multiplier.
     */
    detectErrorSpike(): DetectedPattern | null;
    /**
     * Run all detectors and return patterns that haven't been emitted recently.
     */
    getPatterns(): DetectedPattern[];
    /**
     * Clear all tracked errors and pattern history.
     */
    reset(): void;
}

declare const createLogger: (config: LoggerConfig) => Apperio;

export { Apperio, type AuditEntry, AutoInstrumentation, type Breadcrumb, BreadcrumbManager, CircuitBreaker, type CircuitBreakerConfig, CircuitBreakerState, type CompressionResult, DataSanitizer, type DetectedPattern, type EnvironmentSnapshot, type HealthMetrics, HealthMetricsCollector, type LogEntry, LogLevel, type LoggerConfig, type NetworkRequest, OfflineManager, type OfflineManagerConfig, PII_PATTERNS, PatternDetector, type PerformanceEntry, RemoteConfigManager, type RemoteConfigOptions, type RemoteSDKConfig, type RetentionPolicy, SANITIZATION_PRESETS, type SanitizationConfig, type SanitizationRule, Span, type SpanData, type TraceContext, TraceContextManager, TracePropagator, type UserInteraction, compressPayload, createDataSanitizer, createLogger, getSessionId, preparePayloadForTransmission, uint8ArrayToBase64 };

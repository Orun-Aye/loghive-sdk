import { SanitizationConfig } from "./data-sanitizer";
import { OfflineManagerConfig } from "./offline-manager";
import { RemoteConfigOptions } from "./remote-config";

// src/types.ts
export enum LogLevel {
  TRACE = "trace",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  FATAL = "fatal",
}

export interface LoggerConfig {
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
  // Auto-instrumentation options
  autoCapture?: {
    errors?: boolean;
    performance?: boolean;
    userInteractions?: boolean;
    networkRequests?: boolean;
    consoleMessages?: boolean;
    pageViews?: boolean;
    // Custom log level overrides
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
  // Data sanitization options
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
  onPatternDetected?: (pattern: { type: string; message: string; count: number; windowMs: number; detectedAt: string }) => void;
}

export interface LogEntry {
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
  // Event-specific fields
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

export interface PerformanceEntry {
  name: string;
  type: string;
  startTime: number;
  duration: number;
  size?: number;
}

export interface UserInteraction {
  type: 'click' | 'scroll' | 'keypress' | 'focus' | 'blur';
  target: string;
  timestamp: number;
  coordinates?: { x: number; y: number };
}

export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  duration: number;
  size?: number;
  timestamp: number;
}
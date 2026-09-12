import { Apperio } from './logger';
import { LoggerConfig } from './types';

// src/index.ts
export { Apperio } from './logger';
export {
  LoggerConfig,
  LogEntry,
  LogLevel,
  PerformanceEntry,
  UserInteraction,
  NetworkRequest
} from './types';
export { AutoInstrumentation } from './auto-instrumentation';

/**
 * Session ID for the current page load. Useful for correlating your own
 * analytics with Apperio sessions. See the README for its lifetime.
 */
export { getSessionId } from './utils';
export {
  DataSanitizer,
  createDataSanitizer,
  SANITIZATION_PRESETS,
  PII_PATTERNS,
  type SanitizationConfig,
  type SanitizationRule,
  type RetentionPolicy,
  type AuditEntry
} from './data-sanitizer';
export {
  CircuitBreaker,
  CircuitBreakerState,
  type CircuitBreakerConfig
} from './circuit-breaker';
export {
  compressPayload,
  preparePayloadForTransmission,
  uint8ArrayToBase64,
  type CompressionResult
} from './compression';
export {
  HealthMetricsCollector,
  type HealthMetrics
} from './health-metrics';

// Offline Support
export {
  OfflineManager,
  type OfflineManagerConfig
} from './offline-manager';

// Remote Configuration
export {
  RemoteConfigManager,
  type RemoteConfigOptions,
  type RemoteSDKConfig
} from './remote-config';

// Enhanced Error Context
export {
  BreadcrumbManager,
  type Breadcrumb,
  type EnvironmentSnapshot
} from './breadcrumb-manager';

// Distributed Tracing
export {
  TraceContextManager,
  type TraceContext,
  Span,
  type SpanData,
  TracePropagator
} from './tracing';

// Pattern Detection
export {
  PatternDetector,
  type DetectedPattern
} from './pattern-detector';

// Convenience function for quick setup
export const createLogger = (config: LoggerConfig) => {
  return new Apperio(config);
};

# Apperio SDK

**The JavaScript/TypeScript SDK for the Apperio observability platform.**

Apperio helps you understand what's happening inside your application. Think of it like a security camera for your code: it records what happens, when something goes wrong, and why — so you can fix problems faster and build better software.

```bash
npm install apperio
```

```typescript
import { Apperio } from 'apperio';

const logger = new Apperio({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

logger.info('Hello from Apperio!');
```

That's it. Three lines of code and your app is sending logs to the Apperio dashboard.

---

## Table of Contents

- [What Does This SDK Do?](#what-does-this-sdk-do)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Logging Basics](#logging-basics)
  - [Log Levels](#log-levels)
  - [Logging Messages](#logging-messages)
  - [Logging Errors](#logging-errors)
  - [Adding Context](#adding-context)
- [Auto-Instrumentation](#auto-instrumentation)
  - [Error Monitoring](#error-monitoring)
  - [Performance Monitoring](#performance-monitoring)
  - [Network Request Monitoring](#network-request-monitoring)
  - [User Interaction Tracking](#user-interaction-tracking)
  - [Console Capture](#console-capture)
  - [Page View Tracking](#page-view-tracking)
  - [Web Vitals](#web-vitals)
- [Data Sanitization (PII Protection)](#data-sanitization-pii-protection)
- [Offline Support](#offline-support)
- [Distributed Tracing](#distributed-tracing)
- [Pattern Detection](#pattern-detection)
- [Remote Configuration](#remote-configuration)
- [Framework Guides](#framework-guides)
  - [React](#react)
  - [Next.js](#nextjs)
  - [Vue.js](#vuejs)
  - [Express.js](#expressjs)
  - [Plain Node.js](#plain-nodejs)
- [Graceful Shutdown](#graceful-shutdown)
- [API Reference](#api-reference)
  - [Constructor Options](#constructor-options)
  - [Logging Methods](#logging-methods)
  - [Context Methods](#context-methods)
  - [Error Capture Methods](#error-capture-methods)
  - [Tracing Methods](#tracing-methods)
  - [Sanitization Methods](#sanitization-methods)
  - [Lifecycle Methods](#lifecycle-methods)
- [How It Works Under the Hood](#how-it-works-under-the-hood)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What Does This SDK Do?

When you add Apperio to your app, it does several things:

1. **Sends logs** — You write `logger.info('User signed up')` and that message appears in your Apperio dashboard, searchable and filterable.
2. **Catches errors automatically** — If your app crashes or something breaks, Apperio captures the error with a full stack trace so you can see exactly what went wrong.
3. **Tracks performance** — How fast do your pages load? How long do API calls take? Apperio measures this and tells you when things get slow.
4. **Monitors network requests** — Every `fetch()` and `XMLHttpRequest` your app makes gets logged with status codes, timing, and URLs.
5. **Protects private data** — Emails, credit cards, passwords — Apperio automatically detects and redacts sensitive information before it leaves the browser.
6. **Works offline** — If the user's internet drops, logs are queued in memory and sent when connectivity returns.
7. **Detects patterns** — If the same error happens 3+ times in 5 minutes, or error rates spike, Apperio flags it automatically.

---

## Installation

```bash
# npm
npm install apperio

# yarn
yarn add apperio

# pnpm
pnpm add apperio
```

**Requirements:**
- Node.js 16+ or any modern browser
- TypeScript 5+ (optional but recommended)

The SDK ships as both CommonJS and ESModule:
- `require('apperio')` works in Node.js
- `import { Apperio } from 'apperio'` works in bundlers and modern environments

---

## Quick Start

### Step 1: Get your credentials

Log in to the [Apperio dashboard](https://www.apperio.dev). Create a project. Copy your **API Key** and **Project ID** from the project settings page.

### Step 2: Initialize the logger

```typescript
import { Apperio } from 'apperio';

const logger = new Apperio({
  apiKey: 'your-api-key',       // From your project settings
  projectId: 'your-project-id', // From your project settings
});
```

### Step 3: Start logging

```typescript
logger.info('App started');
logger.warn('Disk space is getting low');
logger.error('Payment failed', new Error('Card declined'));
```

### Step 4: View in the dashboard

Open your Apperio dashboard. Your logs appear in real-time, searchable by level, message, time, and any custom data you attach.

---

## Configuration

### Minimal Configuration (2 required fields)

```typescript
const logger = new Apperio({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});
```

### Full Configuration

Every option below is optional except `apiKey` and `projectId`.

```typescript
import { Apperio, LogLevel } from 'apperio';

const logger = new Apperio({
  // --- Required ---
  apiKey: 'your-api-key',
  projectId: 'your-project-id',

  // --- Connection ---
  endpoint: 'https://apperioserver.onrender.com/api/v1', // Default. Change for self-hosted.

  // --- Logging Behavior ---
  minLogLevel: LogLevel.INFO,   // Only send logs at this level or above. Default: INFO
  batchSize: 10,                // How many logs to collect before sending. Default: 10
  flushIntervalMs: 5000,        // Send logs every N milliseconds. Default: 5000 (5 sec)
  maxRetries: 3,                // How many times to retry a failed send. Default: 3
  retryDelayMs: 1000,           // Wait time before first retry (doubles each time). Default: 1000

  // --- Metadata ---
  environment: 'production',    // e.g. 'development', 'staging', 'production'. Default: 'development'
  serviceName: 'my-app',        // Name of your app/service. Default: 'unknown-service'
  serviceVersion: '2.1.0',      // Version of your app. Default: '1.0.0'
  release: 'v2.1.0',            // Release tag attached to every log entry.

  // --- Auto-Instrumentation ---
  autoCapture: {
    errors: true,               // Catch uncaught errors & promise rejections. Default: true
    performance: true,          // Track page load speed & resource timing. Default: true
    userInteractions: false,    // Track clicks, scrolls, keypresses. Default: false
    networkRequests: true,      // Track fetch() and XMLHttpRequest. Default: true
    consoleMessages: false,     // Capture console.error and console.warn. Default: false
    pageViews: true,            // Track page navigations (SPA-aware). Default: true

    // Override the log level for each auto-captured event type
    logLevels: {
      errors: LogLevel.ERROR,
      networkSuccess: LogLevel.DEBUG,
      networkError: LogLevel.ERROR,
      performanceSlow: LogLevel.WARN,
      performanceFast: LogLevel.DEBUG,
      interactions: LogLevel.TRACE,
      pageViews: LogLevel.INFO,
      console: {
        error: LogLevel.ERROR,
        warn: LogLevel.WARN,
        info: LogLevel.INFO,
      },
    },
  },

  // --- Data Sanitization ---
  sanitization: {
    enabled: true,              // Auto-redact PII (emails, credit cards, etc). Default: true
    config: {                   // Fine-tune sanitization behavior
      // See "Data Sanitization" section for details
    },
  },

  // --- Offline Support ---
  offline: {
    maxQueueSize: 500,          // Max logs to hold offline. Default: 500
    prioritizeCritical: true,   // Keep ERROR/FATAL when queue is full. Default: true
  },

  // --- Distributed Tracing ---
  tracing: {
    enabled: false,             // Enable trace context propagation. Default: false
  },

  // --- Remote Configuration ---
  remoteConfig: {
    enabled: false,             // Fetch config from server at runtime. Default: false
    refreshIntervalMs: 300000,  // How often to check for config changes. Default: 300000 (5 min)
  },

  // --- Pattern Detection ---
  enablePatternDetection: true, // Detect recurring errors and error spikes. Default: true
});
```

### Environment-Based Configuration

A common pattern is to change settings based on whether you're in development or production:

```typescript
const isProd = process.env.NODE_ENV === 'production';

const logger = new Apperio({
  apiKey: process.env.APPERIO_API_KEY!,
  projectId: process.env.APPERIO_PROJECT_ID!,
  environment: process.env.NODE_ENV,

  // In production: only send warnings and above. In dev: send everything.
  minLogLevel: isProd ? LogLevel.WARN : LogLevel.DEBUG,

  // In production: larger batches, less frequent. In dev: small batches, fast.
  batchSize: isProd ? 25 : 5,
  flushIntervalMs: isProd ? 10000 : 2000,

  autoCapture: {
    errors: true,
    performance: true,
    networkRequests: true,
    pageViews: true,
    userInteractions: !isProd,   // Only in development
    consoleMessages: !isProd,    // Only in development
  },
});
```

---

## Logging Basics

### Log Levels

Apperio has 6 log levels, ranked from least to most severe:

| Level | When to use it | Example |
|-------|---------------|---------|
| `TRACE` | Extremely detailed debugging. You almost never need this. | Tracking every variable in a loop |
| `DEBUG` | Helpful information for developers during debugging. | "Function called with args: ..." |
| `INFO` | Normal events that confirm the app is working correctly. | "User logged in", "Order placed" |
| `WARN` | Something unexpected happened, but the app can continue. | "API rate limit at 80%", "Slow query" |
| `ERROR` | Something broke, but the app is still running. | "Payment failed", "Database timeout" |
| `FATAL` | A critical failure. The app might crash. | "Out of memory", "Config file missing" |

When you set `minLogLevel`, only logs at that level or above are sent. For example, `minLogLevel: LogLevel.WARN` means only WARN, ERROR, and FATAL are sent — DEBUG and INFO are silently ignored.

### Logging Messages

```typescript
// Simple messages
logger.trace('Entering calculateTotal function');
logger.debug('Cache hit for user profile');
logger.info('User signed up successfully');
logger.warn('API rate limit approaching 80%');
logger.error('Failed to send email');
logger.fatal('Database connection lost');
```

### Logging with Extra Data

You can attach a data object to any log. This makes logs searchable and filterable in the dashboard.

```typescript
logger.info('Order placed', {
  orderId: 'ORD-12345',
  userId: 42,
  total: 99.99,
  items: 3,
});

logger.warn('Slow database query', {
  query: 'SELECT * FROM products WHERE ...',
  durationMs: 3200,
  table: 'products',
});
```

### Logging Errors

When something goes wrong, pass the Error object as the second argument. Apperio extracts the name, message, and stack trace automatically.

```typescript
try {
  await chargeCustomer(order);
} catch (error) {
  logger.error('Payment processing failed', error, {
    orderId: order.id,
    customerId: order.customerId,
    amount: order.total,
  });
}
```

The `error()` and `fatal()` methods accept an optional Error object:
```typescript
logger.error(message, error?, data?)
logger.fatal(message, error?, data?)
```

All other levels accept a message and optional data:
```typescript
logger.info(message, data?)
logger.debug(message, data?)
```

### Adding Context

Context is data that gets attached to **every** log. Useful for user IDs, session info, etc.

```typescript
// Set context once
logger.setContext({
  userId: 42,
  sessionId: 'abc-123',
  appVersion: '2.1.0',
});

// Now every log includes userId, sessionId, and appVersion
logger.info('Viewed product page');  // includes all context
logger.info('Added item to cart');   // includes all context

// Read current context
const ctx = logger.getContext();

// Clear all context
logger.clearContext();
```

---

## Auto-Instrumentation

Auto-instrumentation is the SDK's ability to capture events automatically, without you writing any code. It works in **browser environments only** (not Node.js).

When you set `autoCapture` options to `true`, the SDK hooks into browser APIs behind the scenes.

### Error Monitoring

```typescript
autoCapture: { errors: true }
```

What it captures:
- **Uncaught exceptions** — `window.onerror` events with full stack traces
- **Unhandled promise rejections** — When you forget a `.catch()` on a Promise
- **Breadcrumbs** — The last 50 user actions before the error, so you can see what led to the crash

All uncaught errors are logged at the `ERROR` level.

### Performance Monitoring

```typescript
autoCapture: { performance: true }
```

What it captures:
- **Page load timing** — How long the page took to fully load (via Navigation Timing API)
- **Resource loading** — Load times for images, scripts, stylesheets
- **Paint metrics** — First Contentful Paint (FCP), Largest Contentful Paint (LCP)
- **Web Vitals** — LCP, CLS (Cumulative Layout Shift), INP (Interaction to Next Paint)

Smart log levels based on performance:
| Metric | Good | Needs Work | Poor |
|--------|------|-----------|------|
| Page load | < 1s (DEBUG) | 1-3s (INFO) | > 3s (WARN) |
| LCP | < 2.5s (DEBUG) | 2.5-4s (INFO) | > 4s (WARN) |
| CLS | < 0.1 (DEBUG) | 0.1-0.25 (INFO) | > 0.25 (WARN) |
| INP | < 200ms (DEBUG) | 200-500ms (INFO) | > 500ms (WARN) |

### Network Request Monitoring

```typescript
autoCapture: { networkRequests: true }
```

What it captures:
- Every `fetch()` and `XMLHttpRequest` call
- HTTP method, URL (sanitized), status code, and duration in milliseconds
- The SDK patches `window.fetch` and `XMLHttpRequest.prototype` transparently

Smart log levels based on response:
| Response | Level |
|----------|-------|
| 2xx success | DEBUG |
| 4xx client error | WARN |
| 5xx server error | ERROR |
| Duration > 5 seconds | WARN |
| Network failure | ERROR |

URL sanitization removes sensitive query parameters automatically.

### User Interaction Tracking

```typescript
autoCapture: { userInteractions: true }
```

What it captures:
- **Clicks** — Element selector, coordinates (DEBUG level)
- **Scrolls** — Throttled to 1 event per 100ms (TRACE level)
- **Focus/Blur** — Which elements gain/lose focus (DEBUG level)
- **Keypresses** — Throttled, key values are NOT captured for privacy (TRACE level)

### Console Capture

```typescript
autoCapture: { consoleMessages: true }
```

What it captures:
- `console.error(...)` — Logged at ERROR level
- `console.warn(...)` — Logged at WARN level
- `console.log(...)` — Logged at INFO level
- `console.info(...)` — Logged at INFO level
- `console.debug(...)` — Logged at DEBUG level

The original console methods still work normally — the SDK wraps them non-destructively.

### Page View Tracking

```typescript
autoCapture: { pageViews: true }
```

What it captures:
- Initial page load
- SPA navigation via `history.pushState()` and `history.replaceState()`
- Back/forward navigation via `popstate` events
- URL, page title, and referrer

Logged at INFO level.

### Web Vitals

Captured automatically when `performance: true` is set. Measures the three Core Web Vitals:

- **LCP (Largest Contentful Paint)** — How fast the main content appears
- **CLS (Cumulative Layout Shift)** — How much the page layout jumps around
- **INP (Interaction to Next Paint)** — How responsive the page is to user input

Each vital is rated as `good`, `needs-improvement`, or `poor` based on Google's thresholds.

---

## Data Sanitization (PII Protection)

The SDK automatically detects and redacts personally identifiable information (PII) before any data leaves the browser. This is **enabled by default**.

### What Gets Redacted

| Pattern | Replaced With | Severity |
|---------|--------------|----------|
| Email addresses | `[EMAIL_REDACTED]` | High |
| Social Security Numbers | `[SSN_REDACTED]` | Critical |
| Credit card numbers | `[CARD_REDACTED]` | Critical |
| Phone numbers (US) | `[PHONE_REDACTED]` | Medium |
| IP addresses | `[IP_REDACTED]` | Medium |
| API keys / tokens | `[API_KEY_REDACTED]` | Critical |
| JWT tokens | `[JWT_REDACTED]` | Critical |
| Bank account numbers | `[ACCOUNT_REDACTED]` | Critical |
| Driver's license numbers | `[DL_REDACTED]` | High |
| Passport numbers | `[PASSPORT_REDACTED]` | High |

### Sensitive Field Anonymization

Fields named `password`, `secret`, `token`, `key`, `ssn`, or `email` (or containing those words) are automatically anonymized:

```typescript
// Before sanitization:
logger.info('User data', { email: 'john@example.com', password: 'hunter2' });

// After sanitization (what gets sent):
// email: "j***************m"
// password: "h*****2"
```

### Sanitization Presets

```typescript
import { SANITIZATION_PRESETS } from 'apperio';

// STRICT — Redacts everything, 7-day retention, full audit trail
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  sanitization: { enabled: true, config: SANITIZATION_PRESETS.STRICT },
});

// BALANCED — Default. 30-day retention, standard PII detection.
// (This is what you get if you don't configure anything.)

// LENIENT — Only redacts critical patterns (SSN, credit cards, API keys). 90-day retention.
const devLogger = new Apperio({
  apiKey: '...',
  projectId: '...',
  sanitization: { enabled: true, config: SANITIZATION_PRESETS.LENIENT },
});
```

### Custom Sanitization Rules

```typescript
// Add your own redaction rule
logger.addCustomSanitizationRule({
  pattern: /INTERNAL-[A-Z0-9]{10}/g,
  replacement: '[INTERNAL_ID_REDACTED]',
  description: 'Internal tracking ID',
  severity: 'medium',
  category: 'custom',
});

// Remove a custom rule
logger.removeCustomSanitizationRule('Internal tracking ID');
```

### Audit Trail

Every sanitization operation is recorded in an audit trail:

```typescript
// Get the audit log
const auditEntries = logger.getAuditTrail();
// Each entry: { timestamp, operation, dataType, originalSize, processedSize, rulesApplied }

// Clear the audit log
logger.clearAuditTrail();
```

---

## Offline Support

When a user's internet connection drops, the SDK queues logs in memory and sends them when connectivity returns.

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  offline: {
    maxQueueSize: 500,          // Hold up to 500 logs offline. Default: 500
    prioritizeCritical: true,   // When full, drop DEBUG/INFO before ERROR/FATAL. Default: true
    onOffline: () => console.log('Gone offline'),
    onOnline: () => console.log('Back online'),
    onSyncComplete: (count) => console.log(`Synced ${count} queued logs`),
  },
});
```

How it works:
1. The SDK listens to the browser's `online` and `offline` events.
2. When offline, logs go into an in-memory queue instead of being sent.
3. When connectivity returns, the queue is flushed automatically.
4. If the flush fails, logs are re-queued.
5. If the queue reaches `maxQueueSize` and `prioritizeCritical` is `true`, the first non-ERROR/FATAL log is evicted to make room.

**Important:** The offline queue uses in-memory storage only — no localStorage or IndexedDB. If the user closes the browser tab, queued logs are lost.

---

## Distributed Tracing

Distributed tracing lets you follow a request as it moves through different services. Each trace gets a unique ID that connects related logs across your frontend, backend, and microservices.

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  tracing: { enabled: true },
});

// Start a trace (usually at the beginning of a user action)
const trace = logger.startTrace('checkout-flow');
// trace = { traceId: 'abc-123...', spanId: 'def-456...', sampled: true }

// Every log now automatically includes traceId and spanId
logger.info('User clicked checkout');

// Create a child span for a sub-operation
const span = logger.createChildSpan('validate-cart');
// ... do the work ...
span.end();

// End the trace
logger.endTrace();
```

When tracing is active, every log entry includes `traceId` and `spanId` fields. You can use these in the dashboard to see all logs from a single user action, even across services.

---

## Pattern Detection

The SDK automatically watches for error patterns on the client side. No server calls required — it runs entirely in the browser.

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  enablePatternDetection: true, // Default: true
});
```

### What It Detects

**Recurring errors** — If the same error message occurs 3+ times within 5 minutes, the SDK logs a pattern detection event:
```
[Pattern Detection] recurring_error: Cannot read property 'x' of null (5 occurrences in 5 min)
```

**Error spikes** — If the last-minute error count is 3x above the rolling 10-minute average (and at least 3 errors occurred), the SDK logs:
```
[Pattern Detection] error_spike: 12 errors in the last 60s (3x above average)
```

Pattern events are logged at `INFO` level and throttled to at most 1 per pattern per 5 minutes to avoid noise.

---

## Remote Configuration

Change SDK settings from the server without redeploying your app.

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  remoteConfig: {
    enabled: true,
    refreshIntervalMs: 300000,  // Check every 5 minutes (default)
    onConfigUpdate: (config) => {
      console.log('Config updated:', config);
    },
  },
});
```

The server can adjust:
- `minLogLevel` — Change verbosity remotely
- `batchSize` and `flushIntervalMs` — Tune batching behavior
- `autoCapture` — Enable/disable specific capture types
- `sanitization.preset` — Switch between STRICT, BALANCED, or LENIENT presets

Configure remote settings from the Apperio dashboard under **Project Settings > SDK Config**. The SDK fetches config immediately on init, then polls at the configured interval.

---

## Framework Guides

### React

```typescript
// lib/logger.ts
import { Apperio, LogLevel } from 'apperio';

export const logger = new Apperio({
  apiKey: process.env.REACT_APP_APPERIO_API_KEY!,
  projectId: process.env.REACT_APP_APPERIO_PROJECT_ID!,
  environment: process.env.NODE_ENV,
  serviceName: 'react-frontend',
  autoCapture: {
    errors: true,
    performance: true,
    networkRequests: true,
    pageViews: true,
  },
});
```

```tsx
// App.tsx — Error boundary integration
import { logger } from './lib/logger';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('React render error', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) return <h1>Something went wrong.</h1>;
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

### Next.js

```typescript
// lib/logger.ts
import { Apperio } from 'apperio';

export const logger = new Apperio({
  apiKey: process.env.NEXT_PUBLIC_APPERIO_API_KEY!,
  projectId: process.env.NEXT_PUBLIC_APPERIO_PROJECT_ID!,
  environment: process.env.NODE_ENV,
  serviceName: 'nextjs-app',
  autoCapture: {
    errors: true,
    performance: true,
    networkRequests: true,
    pageViews: true,
  },
});
```

```tsx
// app/layout.tsx — Client-side initialization
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export function ApperioProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    logger.info('App loaded', { url: window.location.href });

    return () => {
      logger.flush();
    };
  }, []);

  return <>{children}</>;
}
```

```typescript
// For API routes (server-side):
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const start = Date.now();

  try {
    const data = await fetchData();
    logger.info('API request completed', {
      method: 'GET',
      duration: Date.now() - start,
    });
    return Response.json(data);
  } catch (error) {
    logger.error('API request failed', error as Error, {
      duration: Date.now() - start,
    });
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Vue.js

```typescript
// plugins/logger.ts
import { Apperio } from 'apperio';

export const logger = new Apperio({
  apiKey: import.meta.env.VITE_APPERIO_API_KEY,
  projectId: import.meta.env.VITE_APPERIO_PROJECT_ID,
  environment: import.meta.env.MODE,
  serviceName: 'vue-frontend',
  autoCapture: {
    errors: true,
    performance: true,
    networkRequests: true,
    pageViews: true,
  },
});
```

```typescript
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { logger } from './plugins/logger';

const app = createApp(App);

// Global error handler
app.config.errorHandler = (error, instance, info) => {
  logger.error('Vue error', error as Error, {
    component: instance?.$options?.name,
    info,
  });
};

app.mount('#app');
```

### Express.js

```typescript
import express from 'express';
import { Apperio } from 'apperio';

const app = express();

const logger = new Apperio({
  apiKey: process.env.APPERIO_API_KEY!,
  projectId: process.env.APPERIO_PROJECT_ID!,
  environment: process.env.NODE_ENV,
  serviceName: 'express-api',
  autoCapture: {
    errors: true,
    performance: false,          // Not applicable server-side
    networkRequests: false,      // Not applicable server-side
  },
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error'
               : res.statusCode >= 400 ? 'warn'
               : 'info';

    logger[level](`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

### Plain Node.js

```typescript
import { Apperio } from 'apperio';

const logger = new Apperio({
  apiKey: process.env.APPERIO_API_KEY!,
  projectId: process.env.APPERIO_PROJECT_ID!,
  environment: process.env.NODE_ENV || 'development',
  serviceName: 'my-worker',
  serviceVersion: '1.0.0',
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', error);
  setTimeout(() => process.exit(1), 1000); // Allow time to flush
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

---

## Graceful Shutdown

When your application stops, call `shutdown()` to flush any remaining logs and clean up resources.

```typescript
// Browser — before the page unloads
window.addEventListener('beforeunload', () => {
  logger.flush();
});

// Node.js — on process signals
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await logger.shutdown();
  process.exit(0);
});
```

`shutdown()` does the following:
1. Stops the auto-flush timer
2. Cleans up auto-instrumentation hooks
3. Destroys the offline manager, remote config manager, and trace context
4. Resets the pattern detector
5. Sends all remaining logs in the buffer
6. Marks the logger as uninitialized (no more logs accepted)

---

## API Reference

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | *required* | Your project API key |
| `projectId` | `string` | *required* | Your project ID |
| `endpoint` | `string` | `'https://apperioserver.onrender.com/api/v1'` | API endpoint URL |
| `minLogLevel` | `LogLevel` | `LogLevel.INFO` | Minimum level to send |
| `batchSize` | `number` | `10` | Logs per batch |
| `flushIntervalMs` | `number` | `5000` | Auto-flush interval (ms) |
| `maxRetries` | `number` | `3` | Max send retry attempts |
| `retryDelayMs` | `number` | `1000` | Initial retry delay (doubles each attempt) |
| `environment` | `string` | `'development'` | Environment name |
| `serviceName` | `string` | `'unknown-service'` | Service/app name |
| `serviceVersion` | `string` | `'1.0.0'` | Service version string |
| `release` | `string` | `''` | Release tag for every log |
| `autoCapture` | `object` | See below | Auto-instrumentation config |
| `sanitization` | `object` | `{ enabled: true }` | PII sanitization config |
| `offline` | `OfflineManagerConfig` | `{}` | Offline queue config |
| `tracing` | `object` | `{ enabled: false }` | Distributed tracing config |
| `remoteConfig` | `RemoteConfigOptions` | `{}` | Remote config fetching |
| `enablePatternDetection` | `boolean` | `true` | Client-side pattern detection |

### Logging Methods

```typescript
// Standard log methods — message + optional data
logger.trace(message: string, data?: Record<string, any>): void
logger.debug(message: string, data?: Record<string, any>): void
logger.info(message: string, data?: Record<string, any>): void
logger.warn(message: string, data?: Record<string, any>): void

// Error log methods — message + optional Error + optional data
logger.error(message: string, error?: Error, data?: Record<string, any>): void
logger.fatal(message: string, error?: Error, data?: Record<string, any>): void
```

### Context Methods

```typescript
// Add key-value pairs that are included in every log
logger.setContext(context: Record<string, any>): void

// Get a copy of the current context
logger.getContext(): Record<string, any>

// Remove all context
logger.clearContext(): void
```

### Error Capture Methods

```typescript
// Capture an exception with optional extra context
logger.captureException(error: Error, context?: Record<string, any>): void

// Capture a message at a specific level with optional context
logger.captureMessage(message: string, level?: LogLevel, context?: Record<string, any>): void

// Add a breadcrumb (a trail of events leading up to an error)
logger.addBreadcrumb(message: string, category?: string, data?: Record<string, any>): void
```

### Tracing Methods

These return `null` if tracing is not enabled.

```typescript
// Start a new distributed trace
logger.startTrace(name: string): TraceContext | null

// End the current trace
logger.endTrace(): void

// Get the current trace context (traceId, spanId)
logger.getCurrentTrace(): TraceContext | null

// Create a child span within the current trace
logger.createChildSpan(name: string): Span | null
```

### Sanitization Methods

```typescript
// Get current sanitization configuration
logger.getSanitizationConfig(): SanitizationConfig

// Update sanitization configuration
logger.updateSanitizationConfig(config: Partial<SanitizationConfig>): void

// Add a custom PII redaction rule
logger.addCustomSanitizationRule(rule: SanitizationRule): void

// Remove a custom rule by its description string
logger.removeCustomSanitizationRule(description: string): boolean

// Get the audit trail of all sanitization operations
logger.getAuditTrail(): AuditEntry[]

// Clear the audit trail
logger.clearAuditTrail(): void

// Manually trigger cleanup of expired data in the retention cache
logger.cleanupExpiredData(): number
```

### Lifecycle Methods

```typescript
// Check if the logger is initialized
logger.isInitialized(): boolean

// Manually flush all buffered logs now
logger.flush(): Promise<void>

// Gracefully shut down: flush remaining logs, clean up all hooks and timers
logger.shutdown(): Promise<void>
```

---

## How It Works Under the Hood

Understanding the SDK's internals helps you configure it effectively.

### Log Pipeline

```
Your code calls logger.info("message", data)
    |
    v
1. Level Check — Is INFO >= minLogLevel? If not, discard.
    |
    v
2. Build Log Entry — Add timestamp, projectId, service, environment, context, traceId
    |
    v
3. Data Sanitization — Scan message, data, context, metadata for PII patterns. Redact matches.
    |
    v
4. Offline Check — Is the browser offline? If yes, queue in OfflineManager. Stop here.
    |
    v
5. Buffer — Add to in-memory buffer (max 1000 entries).
    |
    v
6. Pattern Detection — If ERROR/FATAL, feed to PatternDetector. Auto-log patterns.
    |
    v
7. Flush Trigger — Buffer size >= batchSize? Or flushIntervalMs timer fires?
    |
    v
8. Send — POST each log to /api/v1/{projectId}/logs with API key header.
    |
    v
9. Retry — On failure: exponential backoff (1s, 2s, 4s). Max 3 attempts.
    |
    v
10. Re-queue — If all retries fail, put logs back in the buffer.
```

### Buffer Management

- Maximum buffer size: **1,000 logs**
- When the buffer is full, the oldest logs are dropped
- Logs are sent individually (one POST per log entry)
- The flush timer runs every `flushIntervalMs` (default 5 seconds)
- A flush also triggers immediately when the buffer reaches `batchSize`

### Retry Strategy

When a log fails to send:
1. **Attempt 1** — Send immediately
2. **Attempt 2** — Wait 1 second (with random jitter), retry
3. **Attempt 3** — Wait 2 seconds, retry
4. **Attempt 4** — Wait 4 seconds, retry
5. **Give up** — Re-add logs to the buffer for the next flush cycle

4xx errors (except 429) are **not retried** — they indicate a permanent problem (wrong API key, invalid project).

### Auto-Instrumentation Mechanism

The SDK hooks into browser APIs by replacing (monkey-patching) global functions:
- `window.fetch` is wrapped to measure timing and capture status codes
- `XMLHttpRequest.prototype.open/send` is wrapped similarly
- `console.error`, `console.warn`, `console.log`, `console.info`, and `console.debug` are wrapped (when enabled)
- `history.pushState` and `history.replaceState` are wrapped for SPA page view tracking
- `PerformanceObserver` is used to capture resource timing and Web Vitals

All original functions are restored when `shutdown()` is called.

---

## Troubleshooting

### "Apperio: API Key is required"

You forgot to pass `apiKey` to the constructor.

```typescript
// Fix: Provide your API key
const logger = new Apperio({
  apiKey: 'your-api-key',        // <-- required
  projectId: 'your-project-id',  // <-- required
});
```

### Logs aren't appearing in the dashboard

1. **Check the API key** — Make sure it matches the one in your project settings.
2. **Check the project ID** — It must be the exact string from the dashboard.
3. **Check `minLogLevel`** — If set to `LogLevel.ERROR`, then `info()` and `warn()` logs are silently dropped.
4. **Check the network tab** — Look for requests to your endpoint URL. Are they returning 200? 401?
5. **Wait for the flush** — Logs are batched. By default they send every 5 seconds or when 10 logs accumulate. Call `logger.flush()` to force an immediate send.

### Auto-instrumentation is not capturing anything

Auto-instrumentation only works in **browser environments**. It does nothing in Node.js.

```typescript
// Make sure the features are enabled:
autoCapture: {
  errors: true,         // Must be true to capture errors
  performance: true,    // Must be true for perf/Web Vitals
  networkRequests: true, // Must be true for fetch/XHR tracking
}
```

### Too many logs / too noisy

Lower the verbosity:

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  minLogLevel: LogLevel.WARN,  // Only WARN, ERROR, FATAL
  autoCapture: {
    errors: true,
    performance: true,
    userInteractions: false,   // Very noisy — disable in production
    consoleMessages: false,    // Can produce duplicates
    logLevels: {
      networkSuccess: LogLevel.TRACE,   // Hide successful network requests
      performanceFast: LogLevel.TRACE,  // Hide fast page loads
    },
  },
});
```

### "Apperio: Authentication/Authorization failed. Check API Key."

Your API key is invalid or expired. Get a new one from the Apperio dashboard under Project Settings.

### "Apperio: Failed to send logs after retries. Re-adding to buffer."

The SDK couldn't reach the backend after 3 attempts. Common causes:
- Backend is down or unreachable
- CORS is blocking requests from your domain
- Network firewall is blocking the endpoint URL

The logs are re-queued and will be retried on the next flush cycle.

### SDK is slowing down my app

Increase batch size and reduce flush frequency:

```typescript
const logger = new Apperio({
  apiKey: '...',
  projectId: '...',
  batchSize: 50,          // Fewer HTTP requests
  flushIntervalMs: 10000, // Flush every 10 seconds instead of 5
  maxRetries: 1,          // Fail fast
});
```

### Console says "AutoInstrumentation: Not in browser environment"

This is expected if you're running in Node.js. Auto-instrumentation features (performance, network, interactions, page views) are browser-only. The SDK still works for manual logging in Node.js.

---

## License

MIT

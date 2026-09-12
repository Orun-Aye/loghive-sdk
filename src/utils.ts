// src/utils.ts
import { LogLevel } from './types';

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const getExponentialBackoffDelay = (
  retryCount: number,
  initialDelayMs: number,
  maxDelayMs: number = 60000
): number => {
  const baseDelay = initialDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * baseDelay * 0.1;
  return Math.min(baseDelay + jitter, maxDelayMs);
};

export const shouldLog = (currentLevel: LogLevel, minLevel: LogLevel): boolean => {
  const levelOrder: Record<LogLevel, number> = {
    [LogLevel.TRACE]: 0,
    [LogLevel.DEBUG]: 1,
    [LogLevel.INFO]: 2,
    [LogLevel.WARN]: 3,
    [LogLevel.ERROR]: 4,
    [LogLevel.FATAL]: 5,
  };

  return levelOrder[currentLevel] >= levelOrder[minLevel];
};

export const getElementSelector = (element: Element): string => {
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element.className) {
    const classes = element.className.toString().split(' ').filter(c => c);
    if (classes.length > 0) {
      return `.${classes.join('.')}`;
    }
  }
  
  return element.tagName.toLowerCase();
};

export const sanitizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'key', 'password', 'secret', 'api_key'];
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });
    return urlObj.toString().replace(/%5B/g, '[').replace(/%5D/g, ']');
  } catch {
    return url;
  }
};

export const isInBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};



/**
 * Extracts error details from various error types
 * Compatible with both browser and Node.js environments
 */
export function extractErrorDetails(error: any): {
  name: string;
  message: string;
  stack?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
} {
  // Handle null/undefined
  if (!error) {
    return {
      name: 'UnknownError',
      message: 'Unknown error occurred'
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      name: 'StringError',
      message: error
    };
  }

  // Handle standard Error objects (works in both browser and Node.js)
  if (error instanceof Error) {
    const result: any = {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
    };

    // Add stack trace if available
    if (error.stack) {
      result.stack = error.stack;
    }

    return result;
  }

  // Handle browser-specific ErrorEvent (only available in browser)
  if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
    return {
      name: 'ErrorEvent',
      message: error.message || 'Unknown error event',
      url: error.filename,
      lineNumber: error.lineno,
      columnNumber: error.colno,
    };
  }

  // Handle objects with error-like properties
  if (typeof error === 'object') {
    return {
      name: error.name || error.constructor?.name || 'ObjectError',
      message: error.message || error.toString() || 'Unknown object error',
      stack: error.stack,
      url: error.url || error.filename,
      lineNumber: error.lineNumber || error.lineno,
      columnNumber: error.columnNumber || error.colno,
    };
  }

  // Fallback for any other type
  return {
    name: 'UnknownError',
    message: String(error)
  };
}

// Alias for compatibility
const isBrowser = isInBrowser

/**
 * Checks if we're running in a Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && !!process.versions && !!process.versions.node;
}

/**
 * Gets environment-specific information
 */
export function getEnvironmentInfo(): {
  runtime: 'browser' | 'node' | 'unknown';
  version?: string;
  userAgent?: string;
} {
  if (isBrowser()) {
    return {
      runtime: 'browser',
      userAgent: navigator.userAgent
    };
  }
  
  if (isNode()) {
    return {
      runtime: 'node',
      version: process.version
    };
  }

  return {
    runtime: 'unknown'
  };
}

/**
 * Safely gets the current URL
 * Returns undefined in Node.js environments
 */
export function getCurrentUrl(): string | undefined {
  if (isBrowser() && typeof window !== 'undefined' && window.location) {
    return window.location.href;
  }
  return undefined;
}

/**
 * Safely gets the referrer
 * Returns undefined in Node.js environments
 */
export function getReferrer(): string | undefined {
  if (isBrowser() && typeof document !== 'undefined') {
    return document.referrer || undefined;
  }
  return undefined;
}

/**
 * Generates a timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Safely stringifies an object, handling circular references
 */
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    
    // Handle functions
    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }
    
    // Handle undefined
    if (value === undefined) {
      return '[undefined]';
    }
    
    return value;
  }, space);
}

/**
 * Generates a UUID v4 string.
 * Uses crypto.randomUUID() when available, falls back to Math.random()-based generation.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Session ID for the current page load.
 *
 * Held in memory only. The SDK never uses localStorage or sessionStorage, so a
 * session does NOT survive a page load: a reload, or any navigation that
 * reloads the document, starts a new session. Known limitation, accepted for
 * v1. Single-page navigations keep the same session because the module stays
 * loaded.
 *
 * Module-level rather than per-instance so that multiple Apperio instances on
 * one page report the same session.
 */
let _sessionId: string | null = null;

/**
 * Returns the session ID for this page load, generating it on first use.
 */
export function getSessionId(): string {
  if (_sessionId === null) {
    _sessionId = generateUUID();
  }
  return _sessionId;
}

/**
 * Validates if a string is a valid UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Truncates a string to a maximum length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | number | undefined;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout as any);
      func(...args);
    };
    
    clearTimeout(timeout as any);
    timeout = setTimeout(later, wait);
  };
}
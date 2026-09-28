// src/replay-recorder.ts
//
// Session replay recorder. This module is never imported statically: the
// logger loads it with a dynamic import() only when replay is enabled and the
// session is sampled in, so neither this code nor rrweb lands in the core
// bundle. Keep it that way: other modules may only `import type` from here.
//
// It is also built as a separate bundle, so it must not import runtime code
// from other SDK modules either: a second copy of utils.ts here would mint a
// different session ID. Anything session-scoped comes in through the transport.

import type { eventWithTime } from '@rrweb/types';
import type { ReplayOptions } from './types';

/**
 * Elements with this class (and everything inside them) have their text
 * replaced with asterisks before it is recorded.
 */
export const MASK_CLASS = 'apperio-mask';

/** Send a segment at least this often while events are arriving */
export const SEGMENT_INTERVAL_MS = 10_000;
/** ...or as soon as it holds this many events */
export const SEGMENT_MAX_EVENTS = 200;
/**
 * ...or once its JSON reaches this many characters. The server rejects
 * segments over 800KB; this leaves room for multi-byte text. A single event
 * larger than this (a huge full snapshot) is still sent, on its own.
 */
export const SEGMENT_MAX_CHARS = 400_000;
/** Browsers refuse keepalive requests with bodies over 64KB */
const KEEPALIVE_MAX_BYTES = 60_000;
const RETRY_DELAY_MS = 2_000;

/**
 * Upper bound on events held in memory while nothing drains the buffer
 * (no transport). New events are dropped once full, never old ones: playback
 * needs the initial full snapshot, so a truncated tail still plays but a
 * missing head does not.
 */
const MAX_BUFFERED_EVENTS = 5000;

/** Where and how segments are uploaded. Supplied by the logger. */
export interface ReplayTransport {
  /** Full ingest URL: {endpoint}/{projectId}/replay */
  url: string;
  headers: Record<string, string>;
  getSessionId: () => string;
  /** Next segment index for this session (0, 1, 2, ...) */
  nextSegmentIndex: () => number;
}

export interface ReplayRecorderOptions extends Pick<ReplayOptions, 'maskAllInputs'> {
  /** Without a transport, events stay in the buffer for takeEvents() */
  transport?: ReplayTransport;
}

export class ReplayRecorder {
  private _buffer: eventWithTime[] = [];
  private _bufferChars = 0;
  private _stopFn: (() => void) | null = null;
  private _recording = false;
  private _dropped = 0;
  private _maskAllInputs: boolean;
  private _transport: ReplayTransport | undefined;
  private _segmentTimer: ReturnType<typeof setTimeout> | null = null;
  private _warned = false;

  constructor(options: ReplayRecorderOptions = {}) {
    this._maskAllInputs = options.maskAllInputs !== false;
    this._transport = options.transport;
  }

  /**
   * Load rrweb and begin recording. Resolves once recording has started.
   */
  async start(): Promise<void> {
    if (this._recording || typeof window === 'undefined') return;

    const { record } = await import('rrweb');

    this._stopFn =
      record({
        emit: (event) => this._push(event),
        // Masking happens here, in the browser, before an event exists: the
        // real value never reaches the buffer, the network, or the server.
        // Every input, textarea and select value becomes asterisks. Opting out
        // still masks passwords; spelled out rather than left to rrweb's default.
        maskAllInputs: this._maskAllInputs,
        ...(this._maskAllInputs ? {} : { maskInputOptions: { password: true } }),
        // Text content inside .apperio-mask elements becomes asterisks
        maskTextClass: MASK_CLASS,
      }) ?? null;
    this._recording = true;

    if (this._transport) {
      // pagehide fires on unload and bfcache; visibilitychange covers mobile,
      // where a hidden tab may be killed without ever unloading.
      window.addEventListener('pagehide', this._onPageHide);
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  /** Stop recording and send whatever is buffered. */
  stop(): void {
    if (this._stopFn) {
      this._stopFn();
      this._stopFn = null;
    }
    this._recording = false;

    if (this._transport) {
      window.removeEventListener('pagehide', this._onPageHide);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      // Shutdown often happens while the page is going away
      this.flush({ keepalive: true });
    }
  }

  /**
   * Send the buffered events as one segment. `keepalive` lets the request
   * outlive the page, for flushes during unload.
   */
  flush({ keepalive = false }: { keepalive?: boolean } = {}): void {
    this._clearSegmentTimer();
    if (!this._transport || this._buffer.length === 0) return;

    const events = this.takeEvents();
    // Claimed now, in flush order, so indexes follow recording order even if
    // the requests complete out of order
    const segmentIndex = this._transport.nextSegmentIndex();
    void this._send(events, segmentIndex, keepalive, true);
  }

  /** Remove and return all buffered events, oldest first. */
  takeEvents(): eventWithTime[] {
    this._bufferChars = 0;
    return this._buffer.splice(0);
  }

  get isRecording(): boolean {
    return this._recording;
  }

  /** Events discarded because the buffer was full */
  get droppedCount(): number {
    return this._dropped;
  }

  private _push(event: eventWithTime): void {
    if (!this._transport) {
      if (this._buffer.length >= MAX_BUFFERED_EVENTS) {
        this._dropped++;
        return;
      }
      this._buffer.push(event);
      return;
    }

    const chars = JSON.stringify(event).length;
    // Flush first if this event would push the segment past the size cap
    if (this._buffer.length > 0 && this._bufferChars + chars > SEGMENT_MAX_CHARS) {
      this.flush();
    }

    this._buffer.push(event);
    this._bufferChars += chars;

    if (this._buffer.length >= SEGMENT_MAX_EVENTS || this._bufferChars >= SEGMENT_MAX_CHARS) {
      this.flush();
    } else if (!this._segmentTimer) {
      // The clock starts with a segment's first event, so an idle page sends nothing
      this._segmentTimer = setTimeout(() => this.flush(), SEGMENT_INTERVAL_MS);
    }
  }

  private async _send(
    events: eventWithTime[],
    segmentIndex: number,
    keepalive: boolean,
    canRetry: boolean
  ): Promise<void> {
    const transport = this._transport!;
    const body = JSON.stringify({ sessionId: transport.getSessionId(), segmentIndex, events });

    let retryable = true;
    try {
      const response = await fetch(transport.url, {
        method: 'POST',
        headers: transport.headers,
        body,
        // An oversized keepalive request is rejected outright, so large
        // segments go as normal requests and may not survive the unload
        keepalive: keepalive && new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES,
      });
      if (response.ok) return;
      // 4xx (bad key, oversized segment) will fail the same way again
      retryable = response.status >= 500 || response.status === 429;
      this._warnOnce(`HTTP ${response.status}`);
    } catch (error) {
      this._warnOnce(error);
    }

    // One retry, same index: the server upserts, so a duplicate is harmless.
    // Not during unload, when there is no page left to retry from.
    if (retryable && canRetry && !keepalive) {
      setTimeout(() => void this._send(events, segmentIndex, false, false), RETRY_DELAY_MS);
    }
  }

  private _warnOnce(reason: unknown): void {
    if (this._warned) return;
    this._warned = true;
    console.warn('Apperio: Failed to upload a session replay segment.', reason);
  }

  private _onPageHide = (): void => {
    this.flush({ keepalive: true });
  };

  private _onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.flush({ keepalive: true });
  };

  private _clearSegmentTimer(): void {
    if (this._segmentTimer) {
      clearTimeout(this._segmentTimer);
      this._segmentTimer = null;
    }
  }
}

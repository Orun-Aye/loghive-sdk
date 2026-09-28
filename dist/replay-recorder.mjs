// src/replay-recorder.ts
var MASK_CLASS = "apperio-mask";
var SEGMENT_INTERVAL_MS = 1e4;
var SEGMENT_MAX_EVENTS = 200;
var SEGMENT_MAX_CHARS = 4e5;
var KEEPALIVE_MAX_BYTES = 6e4;
var RETRY_DELAY_MS = 2e3;
var MAX_BUFFERED_EVENTS = 5e3;
var ReplayRecorder = class {
  constructor(options = {}) {
    this._buffer = [];
    this._bufferChars = 0;
    this._stopFn = null;
    this._recording = false;
    this._dropped = 0;
    this._segmentTimer = null;
    this._warned = false;
    this._onPageHide = () => {
      this.flush({ keepalive: true });
    };
    this._onVisibilityChange = () => {
      if (document.visibilityState === "hidden") this.flush({ keepalive: true });
    };
    this._maskAllInputs = options.maskAllInputs !== false;
    this._transport = options.transport;
  }
  /**
   * Load rrweb and begin recording. Resolves once recording has started.
   */
  async start() {
    if (this._recording || typeof window === "undefined") return;
    const { record } = await import('rrweb');
    this._stopFn = record({
      emit: (event) => this._push(event),
      // Masking happens here, in the browser, before an event exists: the
      // real value never reaches the buffer, the network, or the server.
      // Every input, textarea and select value becomes asterisks. Opting out
      // still masks passwords; spelled out rather than left to rrweb's default.
      maskAllInputs: this._maskAllInputs,
      ...this._maskAllInputs ? {} : { maskInputOptions: { password: true } },
      // Text content inside .apperio-mask elements becomes asterisks
      maskTextClass: MASK_CLASS
    }) ?? null;
    this._recording = true;
    if (this._transport) {
      window.addEventListener("pagehide", this._onPageHide);
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }
  }
  /** Stop recording and send whatever is buffered. */
  stop() {
    if (this._stopFn) {
      this._stopFn();
      this._stopFn = null;
    }
    this._recording = false;
    if (this._transport) {
      window.removeEventListener("pagehide", this._onPageHide);
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
      this.flush({ keepalive: true });
    }
  }
  /**
   * Send the buffered events as one segment. `keepalive` lets the request
   * outlive the page, for flushes during unload.
   */
  flush({ keepalive = false } = {}) {
    this._clearSegmentTimer();
    if (!this._transport || this._buffer.length === 0) return;
    const events = this.takeEvents();
    const segmentIndex = this._transport.nextSegmentIndex();
    void this._send(events, segmentIndex, keepalive, true);
  }
  /** Remove and return all buffered events, oldest first. */
  takeEvents() {
    this._bufferChars = 0;
    return this._buffer.splice(0);
  }
  get isRecording() {
    return this._recording;
  }
  /** Events discarded because the buffer was full */
  get droppedCount() {
    return this._dropped;
  }
  _push(event) {
    if (!this._transport) {
      if (this._buffer.length >= MAX_BUFFERED_EVENTS) {
        this._dropped++;
        return;
      }
      this._buffer.push(event);
      return;
    }
    const chars = JSON.stringify(event).length;
    if (this._buffer.length > 0 && this._bufferChars + chars > SEGMENT_MAX_CHARS) {
      this.flush();
    }
    this._buffer.push(event);
    this._bufferChars += chars;
    if (this._buffer.length >= SEGMENT_MAX_EVENTS || this._bufferChars >= SEGMENT_MAX_CHARS) {
      this.flush();
    } else if (!this._segmentTimer) {
      this._segmentTimer = setTimeout(() => this.flush(), SEGMENT_INTERVAL_MS);
    }
  }
  async _send(events, segmentIndex, keepalive, canRetry) {
    const transport = this._transport;
    const body = JSON.stringify({ sessionId: transport.getSessionId(), segmentIndex, events });
    let retryable = true;
    try {
      const response = await fetch(transport.url, {
        method: "POST",
        headers: transport.headers,
        body,
        // An oversized keepalive request is rejected outright, so large
        // segments go as normal requests and may not survive the unload
        keepalive: keepalive && new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES
      });
      if (response.ok) return;
      retryable = response.status >= 500 || response.status === 429;
      this._warnOnce(`HTTP ${response.status}`);
    } catch (error) {
      this._warnOnce(error);
    }
    if (retryable && canRetry && !keepalive) {
      setTimeout(() => void this._send(events, segmentIndex, false, false), RETRY_DELAY_MS);
    }
  }
  _warnOnce(reason) {
    if (this._warned) return;
    this._warned = true;
    console.warn("Apperio: Failed to upload a session replay segment.", reason);
  }
  _clearSegmentTimer() {
    if (this._segmentTimer) {
      clearTimeout(this._segmentTimer);
      this._segmentTimer = null;
    }
  }
};

export { MASK_CLASS, ReplayRecorder, SEGMENT_INTERVAL_MS, SEGMENT_MAX_CHARS, SEGMENT_MAX_EVENTS };
//# sourceMappingURL=replay-recorder.mjs.map
//# sourceMappingURL=replay-recorder.mjs.map
// tests/replay-transport.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rrwebRecord = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("rrweb", () => ({ record: rrwebRecord }));

import {
  ReplayRecorder,
  SEGMENT_INTERVAL_MS,
  SEGMENT_MAX_EVENTS,
  SEGMENT_MAX_CHARS,
} from "../src/replay-recorder";

const URL = "https://api.example/api/v1/p1/replay";

describe("ReplayRecorder segment shipping", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let recorder: ReplayRecorder;
  let emit: (event: any) => void;
  let index: number;

  /** Parsed bodies of every upload so far */
  const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    rrwebRecord.mockClear();
    index = 0;

    recorder = new ReplayRecorder({
      transport: {
        url: URL,
        headers: { "X-API-Key": "mk_test" },
        getSessionId: () => "session-a1",
        nextSegmentIndex: () => index++,
      },
    });
    await recorder.start();
    emit = (rrwebRecord.mock.calls[0] as any)[0].emit;
  });

  afterEach(() => {
    recorder.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const event = (i: number, size = 10) => ({ type: 3, timestamp: i, data: { t: "x".repeat(size) } });

  it("sends a segment 10 seconds after its first event", () => {
    emit(event(1));
    emit(event(2));
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].events.map((e: any) => e.timestamp)).toEqual([1, 2]);
  });

  it("sends as soon as a segment reaches 200 events", () => {
    for (let i = 0; i < SEGMENT_MAX_EVENTS; i++) emit(event(i));

    expect(sent()).toHaveLength(1);
    expect(sent()[0].events).toHaveLength(SEGMENT_MAX_EVENTS);
  });

  it("sends nothing while the page is idle", () => {
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS * 5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the session ID, the API key and increasing segment indexes", () => {
    emit(event(1));
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS);
    emit(event(2));
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("mk_test");
    expect(sent().map((b) => [b.sessionId, b.segmentIndex])).toEqual([
      ["session-a1", 0],
      ["session-a1", 1],
    ]);
  });

  it("splits segments before they outgrow the server's size limit", () => {
    const big = Math.floor(SEGMENT_MAX_CHARS / 3);
    emit(event(1, big));
    emit(event(2, big));
    emit(event(3, big)); // would exceed the cap: the first two go first

    expect(sent()).toHaveLength(1);
    expect(sent()[0].events).toHaveLength(2);
  });

  it("flushes with keepalive when the page is hidden or unloaded", () => {
    emit(event(1));
    window.dispatchEvent(new Event("pagehide"));

    expect(sent()).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it("flushes what is left on stop", () => {
    emit(event(1));
    recorder.stop();

    expect(sent()).toHaveLength(1);
  });

  it("retries a failed upload once with the same index", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    emit(event(1));
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(sent().map((b) => b.segmentIndex)).toEqual([0, 0]);
  });

  it("does not retry a rejected upload", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 413 }));
    emit(event(1));
    vi.advanceTimersByTime(SEGMENT_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

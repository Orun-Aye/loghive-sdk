// tests/replay-recorder.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const rrwebRecord = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("rrweb", () => ({ record: rrwebRecord }));

import { ReplayRecorder } from "../src/replay-recorder";

describe("ReplayRecorder buffer", () => {
  beforeEach(() => {
    rrwebRecord.mockClear();
  });

  it("hands buffered events over once, oldest first", async () => {
    const recorder = new ReplayRecorder();
    await recorder.start();
    const { emit } = (rrwebRecord.mock.calls[0] as any)[0];

    emit({ type: 2, timestamp: 1 });
    emit({ type: 3, timestamp: 2 });

    expect(recorder.takeEvents().map((e) => e.timestamp)).toEqual([1, 2]);
    expect(recorder.takeEvents()).toEqual([]);
    recorder.stop();
  });

  it("keeps the first events and drops new ones when full", async () => {
    const recorder = new ReplayRecorder();
    await recorder.start();
    const { emit } = (rrwebRecord.mock.calls[0] as any)[0];

    for (let i = 0; i < 5010; i++) emit({ type: 3, timestamp: i });

    const events = recorder.takeEvents();
    expect(events).toHaveLength(5000);
    expect(events[0].timestamp).toBe(0);
    expect(recorder.droppedCount).toBe(10);
    recorder.stop();
  });
});

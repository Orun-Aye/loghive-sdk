// tests/replay.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track whether the lazy recorder module and rrweb are ever loaded
const loads = vi.hoisted(() => ({ recorderModule: 0, rrwebModule: 0 }));
const rrwebStop = vi.hoisted(() => vi.fn());
const rrwebRecord = vi.hoisted(() => vi.fn(() => rrwebStop));

vi.mock("rrweb", () => {
  loads.rrwebModule++;
  return { record: rrwebRecord };
});

vi.mock("../src/replay-recorder", async (importOriginal) => {
  loads.recorderModule++;
  return importOriginal();
});

import type { Apperio } from "../src/logger";

/** Give a dynamic import that was going to happen time to resolve */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("Session replay", () => {
  let logger: Apperio | undefined;
  let ApperioClass: typeof Apperio;

  beforeEach(async () => {
    // Fresh module registry per test, so the load counters are meaningful
    vi.resetModules();
    ({ Apperio: ApperioClass } = await import("../src/logger"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    loads.recorderModule = 0;
    loads.rrwebModule = 0;
    rrwebRecord.mockClear();
    rrwebStop.mockClear();
  });

  afterEach(async () => {
    await logger?.shutdown();
    logger = undefined;
    vi.unstubAllGlobals();
  });

  const create = (replay?: { enabled?: boolean; sampleRate?: number }) =>
    new ApperioClass({ apiKey: "k", projectId: "p", replay });

  it("is off by default and never loads the recorder or rrweb", async () => {
    logger = create();
    await settle();

    expect(loads.recorderModule).toBe(0);
    expect(loads.rrwebModule).toBe(0);
    expect(logger.isReplayRecording()).toBe(false);
  });

  it("records when enabled and the session is sampled in", async () => {
    logger = create({ enabled: true, sampleRate: 1 });
    await vi.waitFor(() => expect(logger!.isReplayRecording()).toBe(true));

    expect(loads.recorderModule).toBe(1);
    expect(loads.rrwebModule).toBe(1);
    expect(rrwebRecord).toHaveBeenCalledTimes(1);
    expect(rrwebRecord).toHaveBeenCalledWith(
      expect.objectContaining({ maskAllInputs: true })
    );
    expect(logger.isReplayRecording()).toBe(true);
  });

  it("does not load anything when the session is sampled out", async () => {
    logger = create({ enabled: true, sampleRate: 0 });
    await settle();

    expect(loads.recorderModule).toBe(0);
    expect(loads.rrwebModule).toBe(0);
  });

  it("stops rrweb on shutdown", async () => {
    logger = create({ enabled: true, sampleRate: 1 });
    await vi.waitFor(() => expect(logger!.isReplayRecording()).toBe(true));

    await logger.shutdown();

    expect(rrwebStop).toHaveBeenCalledTimes(1);
    expect(logger.isReplayRecording()).toBe(false);
  });

  it("discards a recorder that finishes loading after shutdown", async () => {
    logger = create({ enabled: true, sampleRate: 1 });
    // Shut down before the dynamic import resolves
    await logger.shutdown();
    await settle();

    expect(logger.isReplayRecording()).toBe(false);
    // Either it never started, or it started and was stopped straight away
    expect(rrwebRecord.mock.calls.length).toBe(rrwebStop.mock.calls.length);
  });

  describe("dashboard setting", () => {
    /** Serve this replay setting from /sdk-config; everything else succeeds */
    const dashboard = (replay: { enabled: boolean; sampleRate: number } | "down") => {
      const fetchMock = vi.fn((url: string) => {
        if (String(url).endsWith("/sdk-config")) {
          return replay === "down"
            ? Promise.reject(new Error("offline"))
            : Promise.resolve(new Response(JSON.stringify({ status: "success", data: { replay } })));
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };
    const configRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/sdk-config"));

    it("records when the code says nothing and the dashboard turns replay on", async () => {
      const fetchMock = dashboard({ enabled: true, sampleRate: 1 });
      logger = create();

      await vi.waitFor(() => expect(logger!.isReplayRecording()).toBe(true));
      const [[, init]] = configRequests(fetchMock);
      expect(init.headers["X-API-Key"]).toBe("k");
    });

    it("does not record when the dashboard has replay off", async () => {
      dashboard({ enabled: false, sampleRate: 1 });
      logger = create();
      await settle();

      expect(loads.recorderModule).toBe(0);
    });

    it("lets code turn replay off even when the dashboard has it on", async () => {
      const fetchMock = dashboard({ enabled: true, sampleRate: 1 });
      logger = create({ enabled: false });
      await settle();

      expect(configRequests(fetchMock)).toHaveLength(0);
      expect(loads.recorderModule).toBe(0);
    });

    it("uses a sampleRate from code over the dashboard's", async () => {
      dashboard({ enabled: true, sampleRate: 1 });
      logger = create({ sampleRate: 0 });
      await settle();

      expect(loads.recorderModule).toBe(0);
    });

    it("does not record when the setting cannot be fetched", async () => {
      dashboard("down");
      logger = create();
      await settle();

      expect(loads.recorderModule).toBe(0);
    });
  });
});

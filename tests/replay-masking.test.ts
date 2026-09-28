// tests/replay-masking.test.ts
//
// Runs the real rrweb (no mock) and inspects the raw recorded events: the
// same payload that gets uploaded. Secrets must never appear in it.

import { describe, it, expect, afterEach } from "vitest";
import { ReplayRecorder } from "../src/replay-recorder";

const SECRET_PASSWORD = "hunter2-secret";
const SECRET_EMAIL = "ada@example.com";
const SECRET_TEXT = "Ada Lovelace, 4111 1111 1111 1111";

/** Let rrweb's MutationObserver and input listeners flush */
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Replay privacy masking (real rrweb)", () => {
  let recorder: ReplayRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    document.body.innerHTML = "";
  });

  async function record(html: string, options = {}) {
    document.body.innerHTML = html;
    recorder = new ReplayRecorder(options);
    await recorder.start();
    await tick();
  }

  const payload = () => JSON.stringify(recorder!.takeEvents());

  it("masks what is typed into a password field", async () => {
    await record(`<input id="pw" type="password">`);

    type(document.getElementById("pw") as HTMLInputElement, SECRET_PASSWORD);
    await tick();

    const raw = payload();
    expect(raw).not.toContain(SECRET_PASSWORD);
    expect(raw).toContain("*".repeat(SECRET_PASSWORD.length));
  });

  it("masks a password that was already filled in before recording", async () => {
    await record(`<input type="password" value="${SECRET_PASSWORD}">`);

    const raw = payload();
    expect(raw).not.toContain(SECRET_PASSWORD);
    expect(raw).toContain("*".repeat(SECRET_PASSWORD.length));
  });

  it("masks text inputs and textareas by default", async () => {
    await record(`<input id="email" type="email"><textarea id="note"></textarea>`);

    type(document.getElementById("email") as HTMLInputElement, SECRET_EMAIL);
    type(document.getElementById("note") as HTMLTextAreaElement, SECRET_TEXT);
    await tick();

    const raw = payload();
    expect(raw).not.toContain(SECRET_EMAIL);
    expect(raw).not.toContain(SECRET_TEXT);
  });

  it("masks text inside .apperio-mask, including nested elements", async () => {
    await record(
      `<p>Welcome back</p><div class="apperio-mask">Card holder <b>${SECRET_TEXT}</b></div>`
    );

    const raw = payload();
    expect(raw).not.toContain(SECRET_TEXT);
    // Text outside the class is recorded as normal
    expect(raw).toContain("Welcome back");
  });

  it("masks text added to .apperio-mask after recording starts", async () => {
    await record(`<div class="apperio-mask" id="box"></div>`);

    document.getElementById("box")!.textContent = SECRET_TEXT;
    await tick();

    expect(payload()).not.toContain(SECRET_TEXT);
  });

  it("still masks passwords when maskAllInputs is turned off", async () => {
    await record(`<input id="pw" type="password"><input id="name" type="text">`, {
      maskAllInputs: false,
    });

    type(document.getElementById("pw") as HTMLInputElement, SECRET_PASSWORD);
    type(document.getElementById("name") as HTMLInputElement, "visible-name");
    await tick();

    const raw = payload();
    expect(raw).not.toContain(SECRET_PASSWORD);
    expect(raw).toContain("visible-name");
  });
});

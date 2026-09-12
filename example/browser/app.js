/**
 * Apperio browser example.
 *
 * A real multi-page app, so page loads are real page loads. That matters:
 * the SDK's session ID lives in memory only, so every full load starts a new
 * session. Reload the page and watch the chip in the nav change.
 *
 * The right-hand inspector shows the exact JSON the SDK sends, with the
 * top-level sessionId highlighted.
 */

const CONFIG_KEY = "apperio-example-config";
const DEFAULTS = { endpoint: "http://localhost:5000/api/v1", apiKey: "", projectId: "" };

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveConfig(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* private window: the example still runs, it just forgets on reload */
  }
}

/* ------------------------------------------------------------------ */
/* Wire capture. Installed before the SDK loads so nothing is missed.  */
/* ------------------------------------------------------------------ */

const captured = [];
const nativeFetch = window.fetch.bind(window);

window.fetch = async function (input, init) {
  const url = typeof input === "string" ? input : input && input.url;
  const method = (init && init.method) || (input && input.method) || "GET";

  if (method === "POST" && /\/logs(\/batch)?$/.test(url || "")) {
    try {
      const parsed = JSON.parse(init.body);
      const entries = Array.isArray(parsed) ? parsed : parsed.logs || [parsed];
      entries.forEach((e) => captured.unshift({ at: new Date(), entry: e }));
      renderFeed();
    } catch {
      /* not JSON we understand: leave it alone */
    }
  }

  const res = await nativeFetch(input, init);
  if (/\/logs(\/batch)?$/.test(url || "")) setStatus(res.ok ? "ok" : "bad", res.status);
  return res;
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const cfg = loadConfig();
const page = document.body.dataset.page;
let logger = null;
let sessionId = "not started";

if (cfg.apiKey && cfg.projectId) {
  const sdk = await import("/sdk/index.mjs");
  sessionId = sdk.getSessionId();

  logger = new sdk.Apperio({
    apiKey: cfg.apiKey,
    projectId: cfg.projectId,
    endpoint: cfg.endpoint,
    minLogLevel: sdk.LogLevel.TRACE,
    environment: "example",
    serviceName: "apperio-browser-example",
    // Small batches so you see traffic immediately instead of waiting.
    batchSize: 2,
    flushIntervalMs: 2000,
    autoCapture: {
      errors: true,
      performance: true,
      userInteractions: true,
      networkRequests: true,
      consoleMessages: true,
      pageViews: true,
    },
  });

  window.__apperio = logger;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const PAGES = [
  ["/", "Home", "home"],
  ["/checkout.html", "Checkout", "checkout"],
  ["/docs.html", "Docs", "docs"],
];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render() {
  document.getElementById("app").innerHTML = `
    <nav>
      <span class="brand"><i></i> Apperio example</span>
      ${PAGES.map(
        ([href, label, id]) =>
          `<a class="page" href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`
      ).join("")}
      <span class="spacer"></span>
      <span class="session-chip">session <b>${esc(sessionId).slice(0, 8)}</b></span>
    </nav>
    <main>
      <div>${logger ? pageContent() : setupCard()}</div>
      <aside>${inspectorCard()}</aside>
    </main>`;

  wire();
  renderFeed();
}

function setupCard() {
  return `
    <div class="card">
      <h1>Connect the example to a project</h1>
      <p class="lede">Paste an API key and project ID. They stay in this browser and never leave it. Nothing is sent until you fill both in.</p>
      <div style="margin-top:18px">
        <div class="field"><label for="endpoint">Endpoint</label><input id="endpoint" value="${esc(cfg.endpoint)}"></div>
        <div class="field"><label for="apiKey">API key (X-API-Key)</label><input id="apiKey" placeholder="mk_..." value="${esc(cfg.apiKey)}"></div>
        <div class="field"><label for="projectId">Project ID</label><input id="projectId" value="${esc(cfg.projectId)}"></div>
      </div>
      <div class="row"><button class="primary" id="save">Save and start logging</button></div>
      <div class="hint">
        Find both in the dashboard under <b>Project settings</b>. Use your local backend
        (<code>http://localhost:5000/api/v1</code>) so you can watch logs land without touching production.
      </div>
    </div>`;
}

function pageContent() {
  if (page === "checkout") {
    return `
      <div class="card">
        <h1>Checkout</h1>
        <p class="lede">A form with real sensitive fields. Submit it and read the payload on the right: the SDK redacts what it recognises before anything is sent.</p>
        <div style="margin-top:18px">
          <div class="field"><label for="email">Email</label><input id="email" value="ada@example.com"></div>
          <div class="field"><label for="card">Card number</label><input id="card" value="4111 1111 1111 1111"></div>
          <div class="field"><label for="pw">Password</label><input id="pw" type="password" value="hunter2"></div>
        </div>
        <div class="row">
          <button class="primary" data-act="submit">Submit order</button>
          <button class="danger" data-act="throw">Break checkout (uncaught)</button>
        </div>
        <div class="hint">The <b>Break checkout</b> button is the one to use for task A3. Click it once, reload the page, click it again, reload, click a third time. That is three errors from three sessions.</div>
      </div>
      ${verifyCard()}`;
  }

  if (page === "docs") {
    return `
      <div class="card">
        <h1>Docs</h1>
        <p class="lede">A third page so you can generate page views and navigation. Every link here is a full page load, which means a new session each time.</p>
        <div class="row">
          <button data-act="info">Log info</button>
          <button data-act="slow">Slow request (2s)</button>
          <button data-act="fail404">Request that 404s</button>
          <button class="warn" data-act="console">console.error()</button>
        </div>
        <div class="hint">Clicks, page views, and network calls are captured automatically. You did not wire any of these up.</div>
      </div>
      ${verifyCard()}`;
  }

  return `
    <div class="card">
      <h1>Apperio browser example</h1>
      <p class="lede">Every log below goes to your backend through the SDK in <code>dist/</code>, built from your working tree. The inspector on the right shows the exact JSON sent.</p>
      <div class="row">
        <button data-act="info">Log info</button>
        <button data-act="warn">Log warn</button>
        <button data-act="caught">Caught error</button>
        <button class="danger" data-act="throw">Uncaught error</button>
        <button class="danger" data-act="reject">Unhandled rejection</button>
        <button data-act="fail404">Failing request</button>
      </div>
      <div class="row"><button data-act="flush">Flush now</button><button data-act="clear">Clear inspector</button></div>
    </div>
    ${verifyCard()}`;
}

function verifyCard() {
  return `
    <div class="card">
      <h3>Checking the session work</h3>
      <ol class="steps">
        <li><b>A1</b> Click any button and open a payload on the right. It carries a top-level <code>sessionId</code>, highlighted in green, and no <code>context.sessionId</code>.</li>
        <li><b>A2</b> Generate some traffic, then open the project's Sessions page in the dashboard. Those sessions come from here.</li>
        <li><b>A3</b> Trigger the same error on three separate page loads, then check the error group. It should say three users affected.</li>
      </ol>
      <div class="hint">The session chip in the nav changes on every reload. That is the in-memory session ID working as designed, and why one visitor across three page loads counts as three sessions.</div>
    </div>`;
}

function inspectorCard() {
  return `
    <div class="card inspector">
      <div class="head"><h2>Wire inspector</h2><span class="count" id="count"></span></div>
      <p class="lede">Exactly what the SDK POSTs, captured before it leaves the page.</p>
      <div id="status"></div>
      <div class="feed" id="feed"></div>
    </div>`;
}

function renderFeed() {
  const feed = document.getElementById("feed");
  const count = document.getElementById("count");
  if (!feed) return;

  count.textContent = captured.length ? captured.length + " sent" : "";

  if (!captured.length) {
    feed.innerHTML = `<div class="empty">${
      logger ? "Nothing sent yet. Press a button." : "Connect a project to begin."
    }</div>`;
    return;
  }

  feed.innerHTML = captured
    .slice(0, 40)
    .map(({ at, entry }) => {
      const json = esc(JSON.stringify(entry, null, 2))
        .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
        .replace(
          /(<span class="k">"sessionId"<\/span>: )("[^"]*")/,
          '$1<span class="hl">$2</span>'
        );
      return `
        <details class="hit">
          <summary>
            <span class="lvl ${esc(entry.level || "info")}">${esc(entry.level || "log")}</span>
            <span class="msg">${esc(entry.message || "(no message)")}</span>
            <span>${at.toLocaleTimeString()}</span>
          </summary>
          <pre>${json}</pre>
        </details>`;
    })
    .join("");
}

function setStatus(kind, code) {
  const el = document.getElementById("status");
  if (!el) return;
  el.innerHTML =
    kind === "ok"
      ? `<div class="status ok">Backend accepted the batch (${code})</div>`
      : `<div class="status bad">Backend rejected the batch (${code}). Check the API key, project ID, and that the backend is running.</div>`;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function wire() {
  const save = document.getElementById("save");
  if (save) {
    save.addEventListener("click", () => {
      saveConfig({
        endpoint: document.getElementById("endpoint").value.trim().replace(/\/$/, ""),
        apiKey: document.getElementById("apiKey").value.trim(),
        projectId: document.getElementById("projectId").value.trim(),
      });
      location.reload();
    });
  }

  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => act(btn.dataset.act));
  });
}

function act(what) {
  switch (what) {
    case "info":
      logger.info("Viewed the pricing table", { plan: "team", eventType: "interaction" });
      break;

    case "warn":
      logger.warn("Slow response from the pricing service", { ms: 1840 });
      break;

    case "caught":
      try {
        JSON.parse("{ not json");
      } catch (err) {
        logger.error("Could not parse the saved cart", { cartId: "c_8812" }, err);
      }
      break;

    case "throw":
      // Deliberately uncaught: window.onerror auto-capture picks this up.
      setTimeout(() => {
        throw new Error("Checkout button handler failed: total is undefined");
      }, 0);
      break;

    case "reject":
      Promise.reject(new Error("Payment provider timed out after 30s"));
      break;

    case "fail404":
      window.fetch("/definitely-not-here").catch(() => {});
      break;

    case "slow":
      logger.info("Starting a slow request");
      window.fetch("/index.html?slow=" + Date.now()).then(() =>
        logger.info("Slow request finished")
      );
      break;

    case "console":
      console.error("Rendering the invoice table failed", { rows: 0 });
      break;

    case "submit": {
      const payload = {
        email: document.getElementById("email").value,
        cardNumber: document.getElementById("card").value,
        password: document.getElementById("pw").value,
      };
      // Sent on purpose. Read the payload on the right to see what survives.
      logger.info("Order submitted", { ...payload, eventType: "interaction" });
      break;
    }

    case "flush":
      logger.flush();
      break;

    case "clear":
      captured.length = 0;
      renderFeed();
      break;
  }
}

/* Everything is defined: draw the page. */
render();

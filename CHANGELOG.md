# Changelog

All notable changes to the `apperio` SDK. This project follows [Semantic Versioning](https://semver.org/).

Releases before 1.4.0 predate this file; see the git history for those.

## [1.5.2] - 2026-10-08

### Fixed

- **Logs from the last seconds of a visit are delivered.** Logs were flushed on `beforeunload` with a plain request, which browsers cancel when the tab closes, and which mobile browsers often never trigger. The SDK now flushes on `pagehide` and when the tab is hidden, using `keepalive` so the browser finishes the request after the page is gone. In Chrome, closing the tab right after logging lost the log with 1.5.1 and delivers it with 1.5.2.
- **Browser versions are no longer redacted as IP addresses.** Chrome reports its version as four numbers (`Chrome/137.0.0.0`), which the IP rule replaced, garbling every Chrome user agent. Addresses in text, JSON, URLs and sentences are still redacted.

## [1.5.1] - 2026-10-08

### Fixed

- **Uncaught errors are reported as themselves.** Automatic error capture logged every uncaught exception with the fixed message "Uncaught Error", described the browser's `ErrorEvent` instead of the thrown error, and sent no stack trace. The dashboard therefore merged every uncaught error into one group, with no stack for suspect commits to match. Each one now arrives with its real type, message and stack, for example `TypeError: Cannot read properties of undefined (reading 'email')`, and the file, line and column it came from in `data.source`.
- **Unhandled promise rejections** are logged with the rejection's own error and message instead of the fixed "Unhandled Promise Rejection" text.
- Errors that arrive without an error object, such as a cross-origin "Script error." or a rejected string, keep the type named in their message (`Uncaught TypeError: ...` becomes a `TypeError`) and carry no stack. Before, they could carry one captured inside the SDK, pointing at the SDK instead of your code.

## [1.5.0] - 2026-09-29

### Added

- **Session replay.** Records DOM changes, clicks and scrolls with [rrweb](https://github.com/rrweb-io/rrweb) so a session can be watched back in the dashboard. Off by default and browser-only. Turn it on with `replay: { enabled, sampleRate, maskAllInputs }`, or leave `replay.enabled` unset and the SDK follows the project's dashboard setting. Code always wins over the dashboard. If the setting cannot be fetched, nothing is recorded.
- **Privacy masking for replay.** Every input, textarea and select value is masked by default. Passwords are always masked, even with `maskAllInputs: false`. Text inside `.apperio-mask` is masked too, including nested and later-added text.
- **`isReplayRecording()`** reports whether the recorder has loaded and is recording.

### Changed

- `rrweb` is now a dependency. It lives in a separate lazy-loaded entry (`dist/replay-recorder.*`) fetched with `import()` only when replay is on and the session is sampled in, so the core bundle carries only the loader.
- Replay segments upload every 10 seconds or every 200 events, flush with `keepalive` when the page is hidden or unloaded, and carry the same `sessionId` as your logs.

### Fixed

- Performance capture no longer logs the SDK's own uploads, which could feed an endless log loop.

## [1.4.0] - 2026-09-12

Tagged but never published to npm. These changes first ship in 1.5.0.

### Added

- **Session IDs on every log.** Each log entry now carries a top-level `sessionId` that groups all activity from one page load. This powers the Sessions view in the dashboard and the "Sessions affected" count on error groups, both of which previously read empty or zero for SDK traffic.
- **`getSessionId()` is now a public export.** Use it to correlate your own analytics with Apperio sessions.
- **Browser example app** (`example/browser`). A real multi-page app with a wire inspector that shows the exact JSON the SDK sends. Run it with `npm run example:browser`. Not shipped in the npm package.

### Changed

- The data sanitizer's audit trail now reads the top-level `sessionId`, falling back to `context.sessionId` for older callers.

### Known limitations

- The session ID is held in memory only. The SDK uses no `localStorage`, `sessionStorage`, or cookies, so a full page load starts a new session. Single-page route changes keep the same session. One visitor browsing several pages therefore produces several sessions. See the Sessions section of the README.

# Changelog

All notable changes to the `apperio` SDK. This project follows [Semantic Versioning](https://semver.org/).

Releases before 1.4.0 predate this file; see the git history for those.

## [1.4.0] - 2026-09-12

### Added

- **Session IDs on every log.** Each log entry now carries a top-level `sessionId` that groups all activity from one page load. This powers the Sessions view in the dashboard and the "Sessions affected" count on error groups, both of which previously read empty or zero for SDK traffic.
- **`getSessionId()` is now a public export.** Use it to correlate your own analytics with Apperio sessions.
- **Browser example app** (`example/browser`). A real multi-page app with a wire inspector that shows the exact JSON the SDK sends. Run it with `npm run example:browser`. Not shipped in the npm package.

### Changed

- The data sanitizer's audit trail now reads the top-level `sessionId`, falling back to `context.sessionId` for older callers.

### Known limitations

- The session ID is held in memory only. The SDK uses no `localStorage`, `sessionStorage`, or cookies, so a full page load starts a new session. Single-page route changes keep the same session. One visitor browsing several pages therefore produces several sessions. See the Sessions section of the README.

# Snaky release verification

Recorded 2026-10-20 (America/Los_Angeles).

> **Post-verification change (2026-10-23):** Arcade mode was added after this record. It starts at 200 ms, tightens by 10 ms every 5 foods, and floors at 80 ms; Classic keeps 125 ms. The interface was also replaced with a single 1990s arcade cabinet. The Node suite now passes 31/31 and the build passes. The updated 13-check suite passed 13/13 in headless Google Chrome 156.0.8078.47, including no-scroll fit at 1440×900, 1366×768, and 360×640. Ready/running screenshots at 1440×900, 1366×768, 768×1024, and 360×640 were reviewed; interactive Chrome/Safari checks and the hosting gate below were not rerun and remain historical for the earlier build.

> **Review fixes (2026-10-24):** A running game now pauses when the board loses focus. The release build also tolerates CRLF sources. Other changes: the renderer scales with `BOARD_SIZE` and the canvas size, the canvas is exposed as `role="img"`, the Classic HUD label comes from `TICK_MS`, and stored Best only accepts reachable scores. The Node suite passes 32/32 and a CRLF copy builds. The browser QA's focus-loss assertion was added but has not been run in a browser; rerun `/qa/browser.html` before claiming 13/13.

## Verified

- Environment: macOS 26.7.1 (25G241), Node.js 26.8.1, npm 11.19.0.
- `npm ci`: succeeds; zero runtime/development dependencies, no vulnerabilities reported.
- `npm test`: 25 tests pass, zero failures. Rule tests control randomness; lifecycle tests control time.
- `npm run build`: succeeds. `dist/index.html` embeds all game code, CSS, and favicon. It has no external script, font, style, image, or API dependency. The bundled game and bundled browser suite both parse successfully.
- A clean source copy at `/private/tmp/snaky-clean-kfgv3f97/game`, excluding Git metadata, build output, packages, and the release archive, independently passed `npm ci`, all 25 tests, and `npm run build`.
- Independent code review found no additional rules, input, lifecycle, or storage defects after the pause-focus correction.

The deterministic suite covers initialization, all food-placement choices, one-cell movement, growth and ten-point scoring, legal/rejected/rapid turns, four solid walls, occupied-body collision, vacating tail, final meal and 400-cell completion, fixed first-tick timing, pause/resume/complete restart reset, one-timer enforcement, disposed controllers, and absent/corrupt/denied storage.

## Browser gate: Chrome and Safari verified; Firefox unavailable

`dist/qa/browser.html` contains 12 integration checks using the release interface and the same compiled application code. It checks ready/start timing, Arrow/WASD/repeated/rapid input, modifier/Tab/outside-board default handling, P/Escape pause semantics, buttons and duplicate-loop prevention, visibility/window-blur pause, collision/restart, displayed/persisted Best, all-400-cell completion UI, denied storage, 360/768/1440 layouts/resizing, focus styles, and rendered pixels.

All 12 integration checks passed in the connected Chrome browser on the user-started production HTTP preview. The QA page recorded running Google Chrome **155.0.8059.85** on MacIntel. The installed application's Info.plist reports 156.0.8078.47, so that installed version is not substituted for the actual tested running browser. Native keyboard checks confirmed Start focuses the board, P pauses with board focus retained, Tab exits normally, and ArrowDown scrolls the page outside gameplay. Actual 360/768/1440 viewport measurements show a square board and no horizontal overflow. Resizing retained the paused run. Screenshots visually confirmed the narrow, intermediate, and desktop designs. No application errors were found; unrelated browser-extension warnings were excluded from the application result.

The user manually confirmed **Safari 27.0** passes all 12 browser integration checks and the ordinary Start → pause → resume → lose → restart flow on the same production build, on macOS 26.7.1.

Measured contrast ratios: ordinary muted text 7.96:1, footer text 7.23:1, status text 10.10:1, board boundary 3.93:1, pause boundary 3.50:1, pink focus outline 8.85:1, cyan focus outline 14.27:1.

The user confirmed **Firefox is unavailable**. A current Firefox installer was downloaded from Mozilla, but mounting its disk image failed with `Device not configured`. No system browser configuration was changed. Firefox is not claimed as tested. Safari evidence is user-reported; Chrome evidence is agent-observed through the connected browser.

To complete verification:

1. Keep the user-started `npm run preview` running. The sandbox used for implementation rejects listening ports (`EPERM`); an attempted escalation was automatically rejected because escalation is disabled.
2. Open the printed HTTP URL in each release browser and run Start → steer → pause → resume → game over → restart. Check Tab, Arrow/WASD, P/Escape, browser shortcuts, and normal page scrolling outside the board. Switching windows/tabs must pause without automatic resume.
3. Open `/qa/browser.html` in each browser. Record the exact browser/OS version and all results. Resolve any failures, rebuild, and repeat the affected checks.
4. Inspect the game at 360, 768, and 1440 CSS pixels. The board must remain square; cells/edges, score, instructions, and actions must remain readable with no horizontal overflow. Resizing a paused run must preserve it.

## Hosting gate: pending

The Sites plugin created a new owner-private Site. Its identity is preserved in `.openai/hosting.json`; no credential is saved in the source. Source synchronization failed before a source push because the helper could not resolve `git.chatgpt-team.site`. There is no saved or deployed version and no live URL is claimed.

The deliverable is the local static `dist/` build. The private Site can be published later by resuming the supported Sites workflow once its Git endpoint is reachable. Do not create another Site for this source.

## Scope

MKT-26 is an optional mobile/touch follow-up and remains in Backlog. Its iOS Safari/Android Chrome acceptance gate is not part of this keyboard-only release. MKT-20/21/22/23/24/27 are Done. MKT-25 remains In Progress pending disposition of unavailable Firefox coverage. All issues have progress comments with the implementation and verification state.

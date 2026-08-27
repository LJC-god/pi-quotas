# Static Usage UI Design

## Goal

Replace the oversized interactive quota dashboard with the compact, transcript-persistent `/usage` presentation used by `pi-usage-meters`, while preserving pi-quotas provider coverage, active-subscription filtering, caching, diagnostics, and setup commands. Remove decorative Unicode from the always-on footer so it remains readable through Windows terminal and encoding boundaries.

## User experience

- `/usage` appends a compact quota entry to the chat transcript. The entry is TUI-only and never enters LLM context.
- `/usage --refresh` bypasses provider caches. Invalid arguments show `Usage: /usage [--refresh]`.
- `/quotas` remains as a compatibility alias and produces the same static entry.
- Provider commands such as `/codex:quotas` append the same compact entry for one provider and retain diagnostic errors.
- The combined view continues to omit providers that have no configured subscription, credentials that cannot expose subscription usage, or successful responses with no quota windows.
- Each provider has one coloured heading. Each quota window uses one aligned row containing a ten-cell bar, usage or remaining amount, and reset information. There are no borders, blank spacer rows, version banners, or close/refresh instructions.
- A dim fetched timestamp terminates the entry.
- The footer uses ASCII separators and words, for example `Codex | 7d: 87% left (reset in 5d23h24m) | cap: OK`.

## Architecture and data flow

The command extension fetches the existing structured `QuotasResult` values, converts `Date` instances to a JSON-safe entry payload, then calls `pi.appendEntry`. A registered entry renderer converts that payload into ANSI-coloured text and returns a `Text` component. Explicit serialization keeps restored session entries identical to newly appended entries. The existing visibility filter determines the combined-provider list; provider-specific commands deliberately retain their single error result.

The installed Earendil Pi runtime exposes `registerEntryRenderer`; the public TypeScript peer currently models the older Mario API. A small local compatibility type will feature-detect the entry renderer. If it is unavailable, commands fall back to a compact `ctx.ui.notify` rendering instead of opening an interactive custom UI.

## Error handling and compatibility

Fetching remains bounded by existing provider timeouts and cache rules. Combined output shows configured-provider network or HTTP failures but suppresses missing and non-applicable subscriptions. No credential or response body is serialized. `/quotas` is retained to avoid breaking existing habits and documentation links, while `/usage` becomes the primary command. The old standalone `pi-usage-meters` package must be removed from the local Pi installation after this release because both packages otherwise register `/usage`.

## Testing

Pure renderer tests cover compact line count, provider colours, count/currency windows, restored ISO reset timestamps, errors, and empty data. Command tests verify `/usage`, its refresh flag, `/quotas` aliasing, provider diagnostics, entry persistence, and the no-entry-renderer fallback. Footer tests require ASCII-only structural markers and explicitly reject the middle-dot and return-arrow glyphs. The release gate is the full test suite, typecheck, lint, npm dry-run pack audit, public registry verification, and a local Pi installation check.

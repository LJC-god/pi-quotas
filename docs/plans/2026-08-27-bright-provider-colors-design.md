# Bright Provider Colours Design

## Goal

Make each subscription block in the static `/usage` transcript immediately distinguishable with a unique bright colour. Eliminate white and grey quota rows while keeping the compact old-style layout unchanged.

## Design

The renderer will use a fixed, high-saturation palette keyed by provider: orange for Anthropic, emerald for Codex, lime for Copilot, magenta for OpenRouter, cyan for Synthetic, yellow for Grok, violet for Z.ai, rose for GLM China, azure for OpenCode Go, and electric blue for Kimi. No two providers share a colour and none use white or neutral grey.

Colour applies to the complete provider block: heading, quota labels, bar glyphs, percentages, count/currency details, reset clock, and provider error line. The final fetched timestamp remains dim so it does not compete with quota data. The active-provider footer is unchanged because its green/amber/red colours communicate severity rather than provider identity.

The palette stays deterministic rather than deriving colours from plan names. Provider identity is always available, while several quota APIs omit or inconsistently name plan tiers. Tests will render every supported provider, extract the ANSI prefix for each block, and require ten unique non-white/non-grey colours. A focused regression test will also require each window line to carry the same ANSI colour as its heading.

This is a patch release (`0.5.2`). After full tests, typecheck, lint, package audit, and a real Pi terminal check, the release will be published and installed locally.

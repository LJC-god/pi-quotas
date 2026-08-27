# ZAI Coding CN quota support design

## Context and decision

Pi treats `zai` and `zai-coding-cn` as distinct model providers, with different credentials, API hosts, and authorization formats. The quota extension currently supports only the global `zai` provider, so a configured China Coding Plan is reported as missing and its active-model footer is unavailable.

Implement `zai-coding-cn` as a first-class quota provider. This is preferable to silently falling back from `zai` because credentials must never cross regions, the active model should fetch the matching account, and users may legitimately configure both subscriptions. The combined dashboard will therefore show `Z.ai` and `GLM China` separately when both return quota windows. Once the inactive-provider filtering change is integrated, an unconfigured region remains hidden.

## Data flow and security

Add `zai-coding-cn` to the supported-provider registry, label map, cache TTL map, and provider command metadata. Its fetcher resolves only `authStorage.getApiKey("zai-coding-cn")`, calls `https://open.bigmodel.cn/api/monitor/usage/quota/limit`, and sends the key as the raw `Authorization` value required by that endpoint. The existing global fetcher remains unchanged and continues to use `Bearer` against `api.z.ai`.

Both endpoints share the same response parser. Extend the parser with a provider argument so every returned window retains the correct provider identity, and handle the China plan's `CREDIT_LIMIT` entries as session or monthly credit windows with absolute counts. Register `/zai-cn:quotas` for direct diagnosis; `/quotas`, the active-provider footer, and quota warnings work automatically through the shared supported-provider registry.

Failures use existing error kinds. A missing China key produces a `config` result, which the combined dashboard hides but the provider-specific command exposes. HTTP, timeout, cancellation, and network failures remain visible. Tests cover endpoint and header selection, token and credit response shapes, response provider identity, provider registration, command metadata, missing credentials, and unchanged global behavior. No real key is stored in fixtures or logs.

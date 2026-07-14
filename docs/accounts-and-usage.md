# Accounts, keys and usage

API keys are CPM-owned encrypted slots. OAuth accounts are client/driver-owned pools.

Use `cpm key use|next|best` for API providers and `cpm accounts use|next` for account-backed clients. This separation prevents CPM from attempting to refresh or rewrite OAuth credentials it does not own.

`codex-multi-auth` and `oc-codex-multi-auth` expose account health and quota information. CPM invokes their machine-readable commands and normalizes the result. GitHub account switching delegates to `gh auth switch`.

Native provider usage is intentionally allowlisted. An unsupported provider produces an unavailable result instead of a fabricated balance.

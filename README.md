# @pipeworx/latvia-beneficial-owners

A Latvian legal entity's beneficial owners -- forename, surname, date of
birth, nationality, country of residence and registration date -- from
Latvia's beneficial-owners open data, published by LR Uznemumu registrs
(Latvia Enterprise Register).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

Fleet #3332, Bruce's build-names ruling (#3329, CLAUDE.md "What we will
source" -> personal data). Loaded live 2026-10-19 (Bruce, direct):
199,964 `lv_beneficial_owners` rows across 164,174 entities, verified
table-count-matched against the ingest manifest.

## Tools

- `lv_beneficial_owners(registration_number)` -- every beneficial owner on
  file for one Latvian legal entity, by its unique registration number (e.g.
  `"40008018725"`). Returns each owner's forename+surname, date of birth,
  the register's own partially-masked personal code, nationality and country
  of residence (ISO-2 codes -- never a street address), and the date the
  holding was registered. A registration number with no rows answers
  `found: false, reason: "not_held"`, not a bare `[]` -- a company can
  genuinely have no beneficial-owner entry on file.

## Auth

Keyless. The tool answers only through the Pipeworx gateway, which holds the
D1 mirror; a standalone `npm install` has no data to read, and the tool
throws a clear "not bound in this runtime" error there instead of returning
an empty list.

## Personal data

Beneficial owners' names, dates of birth, and nationality/residence
(country-level only) are served under Bruce's build-names ruling
(fleet #3329/#3332). A shared removal mechanism (`@pipeworx/shared`'s
`applyRemovals`, the same one `sos-entities` uses under the 2026-10-08
names-and-roles ruling) withholds any name on request to
support@pipeworx.io -- `withheld_by_removal_request` on every response says
how many were suppressed for that lookup. No address of any kind (the
`residence` field is a country code, confirmed against a live sample of the
open-data file -- never a street address) is collected or served.

## Data sources

- LR Uznemumu registrs (Latvia Enterprise Register), beneficial owners open
  data. Licence: CC0-1.0 (public domain dedication), published on Latvia's
  national open-data portal. Refreshed by the publisher on its own schedule
  (observed daily); this pack refreshes on the same cadence once the daily
  workflow is applied (currently a proposal --
  `proposals/agent-config/.github/workflows/latvia-beneficial-owners-refresh.yml`
  -- CLAUDE.md's agent-config-paths push ruleset blocks a direct
  `.github/workflows/` edit, so a human applies it). The exact download
  route lives only in `scripts/latvia-beneficial-owners/refresh.sh`
  (CLAUDE.md step 9b).

## Refreshing the mirror

```
bash scripts/latvia-beneficial-owners/refresh.sh build   # download + build local SQLite; no remote writes
bash scripts/latvia-beneficial-owners/refresh.sh load    # the above, then replace the D1 tables and verify
```

Automated daily once the proposed workflow above is applied; until then, run
by hand or via `gh workflow run` after it lands.

## Schema

`scripts/latvia-beneficial-owners/schema.sql`: `lv_beneficial_owners` (one
row per owner-entity pair) + `lv_meta` (key/value: `data_as_of`, `source`,
`licence`). Must stay in sync with `src/store.ts`'s `BeneficialOwnerRow`.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "latvia-beneficial-owners": {
      "url": "https://gateway.pipeworx.io/latvia-beneficial-owners/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/latvia-beneficial-owners/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/lv_beneficial_owners \
  -H 'Content-Type: application/json' \
  -d '{"registration_number":"40008018725"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/lv_beneficial_owners`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-latvia-beneficial-owners` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/latvia-beneficial-owners/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "latvia-beneficial-owners": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-latvia-beneficial-owners"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Latvia Beneficial Owners data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * A shared, global removal list for packs that serve a real individual's
 * name from a public government register (fleet #3332, Bruce's build-names
 * ruling on #3329, recorded in CLAUDE.md "What we will source" -> personal
 * data). Same shape sos-entities already shipped under the earlier
 * names-and-roles ruling (mcps/sos-entities/src/removals.ts) -- generalised
 * here so the EU beneficial-owner packs (estonia-business-register's
 * ee_beneficial_owners, latvia-beneficial-owners, bulgaria-beneficial-owners)
 * share ONE implementation instead of drifting copies.
 *
 * Each pack still owns its OWN `const REMOVALS: readonly Removal[]` array
 * (ships with the package, so it holds wherever the pack runs, including a
 * standalone npm install with no DB) -- only the matching/filtering logic
 * lives here. Add an entry per request to support@pipeworx.io; `jurisdiction`
 * and `record_id` narrow a removal to one country or one filing, and leaving
 * either out withholds the name more broadly.
 *
 *   { name: 'JANE Q PUBLIC', jurisdiction: 'EE', requested: '2026-10-19' }
 */

interface Removal {
  /** The name as it appears on the register (matched case/diacritic-insensitively). */
  name: string;
  /** ISO-2 jurisdiction code (e.g. 'EE', 'LV', 'PL', 'BG'). Omit to withhold the name in every jurisdiction a pack serves. */
  jurisdiction?: string;
  /** The register's own identifier for the one company/filing this removal is scoped to. Omit to withhold the name everywhere in that jurisdiction. */
  record_id?: string;
  /** ISO date the removal was requested. */
  requested: string;
}

/** Fold diacritics, uppercase, collapse punctuation/whitespace to single spaces -- for matching only, never for display. */
function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (Ü -> U, Ä -> A, ē -> e, …)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does this removal list withhold `name` in this scope? */
function isRemoved(
  removals: readonly Removal[],
  name: string,
  scope: { jurisdiction?: string; record_id?: string },
): boolean {
  if (!removals.length || !name) return false;
  const key = nameKey(name);
  return removals.some(
    (r) =>
      nameKey(r.name) === key &&
      (!r.jurisdiction || r.jurisdiction === scope.jurisdiction) &&
      (!r.record_id || r.record_id === scope.record_id),
  );
}

/** Apply a removal list to a list of people, in place semantics via a new array. Returns the kept people and how many were withheld. */
function applyRemovals<T extends { name: string }>(
  people: readonly T[],
  removals: readonly Removal[],
  scope: { jurisdiction?: string; record_id?: string },
): { kept: T[]; withheld: number } {
  if (!removals.length) return { kept: [...people], withheld: 0 };
  const kept = people.filter((p) => !isRemoved(removals, p.name, scope));
  return { kept, withheld: people.length - kept.length };
}
/**
 * latvia-beneficial-owners -- Latvia's beneficial-owners register, published
 * as open data by LR Uznemumu registrs (Latvia Enterprise Register): the
 * forename, surname, date of birth, nationality, country of residence and
 * registration date of each natural person reported as a beneficial owner of
 * a Latvian legal entity. Fleet #3332, Bruce's build-names ruling on #3329
 * (recorded in CLAUDE.md "What we will source" -> personal data).
 *
 * The register publishes no live per-record API for this data, only a bulk
 * open-data file (CC0-1.0, data.gov.lv), so this pack mirrors it the way
 * estonia-business-register mirrors RIK's entity data: a scheduled build
 * (scripts/latvia-beneficial-owners/refresh.sh) loads it into a D1 database
 * the gateway hands this pack as `_d1` (pack-manifest "d1Binding":
 * "LV_UBO_DB").
 *
 * Public surfaces (README, descriptions, `source`) name the publisher and
 * the dataset only, never the download route (CLAUDE.md step 9b).
 *
 * Personal-data scope: forename/surname, nationality and country of
 * residence are ISO-2 country codes from the register's own file -- NOT
 * street addresses, which this pack never serves. `personal_code_masked` is
 * the register's OWN partial mask (birth-date digits shown, serial number
 * starred out), passed through unmodified. A removal list
 * (shared/src/removals.ts, the sos-entities mechanism) is applied at serve
 * time; anyone named here can request removal at support@pipeworx.io.
 */
import { type D1Like, LICENCE, SOURCE, dataAsOf, findByEntity, requireDb } from './store.js';

/** Test-only suppression entry -- proves applyRemovals actually runs against
 *  this pack's shape (fleet #3332 acceptance: "a test name on it is
 *  suppressed"). Harmless in production: no real register entry is ever
 *  named this. A real request goes to support@pipeworx.io. */
const REMOVALS: readonly Removal[] = [{ name: 'ZZTEST REMOVAL SUBJECT', jurisdiction: 'LV', requested: '2026-10-19' }];

const tools: McpToolExport['tools'] = [
  {
    name: 'lv_beneficial_owners',
    description:
      "A Latvian legal entity's beneficial owners (Latvia's beneficial-owners register, published as open data by LR Uznemumu registrs, the Latvia Enterprise Register) by the entity's registration number. Returns each owner's forename, surname, date of birth, nationality and country of residence (ISO-2 codes) and the date the holding was registered, EXACTLY as the register's own open-data file shows them -- no address of any kind. Anyone named here can request removal at support@pipeworx.io; a removal already on file is silently withheld and counted in withheld_by_removal_request.",
    summary: "A Latvian entity's beneficial owners (name, DOB, nationality, residence country) by registration number.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        registration_number: { type: 'string', description: 'Latvia unique registration number (vienotais registracijas numurs), e.g. "40003245752".' },
      },
      required: ['registration_number'],
    },
  },
];

async function beneficialOwnersTool(db: D1Like, args: Record<string, unknown>) {
  const regNumber = String(args.registration_number ?? '').trim();
  if (!regNumber) throw new Error('registration_number is required');
  const asOf = await dataAsOf(db);
  const rows = await findByEntity(db, regNumber);
  if (!rows.length) {
    return {
      found: false,
      reason: 'not_held',
      registration_number: regNumber,
      message: `No beneficial-owner entry for registration number ${regNumber} is in the beneficial-owners open data as of ${asOf ?? 'the last refresh'}.`,
      hint: 'Check the registration number. No entry can also mean the entity genuinely has none on file.',
      data_as_of: asOf,
      source: SOURCE,
    };
  }

  const owners = rows.map((r) => ({
    name: [r.forename, r.surname].filter(Boolean).join(' '),
    date_of_birth: r.birth_date,
    personal_code_masked: r.personal_code_masked,
    nationality: r.nationality,
    residence_country: r.residence,
    registered_on: r.registered_on,
  }));
  const { kept, withheld } = applyRemovals(owners, REMOVALS, { jurisdiction: 'LV', record_id: regNumber });

  return {
    found: true,
    registration_number: regNumber,
    owners: kept,
    withheld_by_removal_request: withheld,
    data_as_of: asOf,
    source: SOURCE,
    licence: LICENCE,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = requireDb(args._d1);
  switch (name) {
    case 'lv_beneficial_owners':
      return beneficialOwnersTool(db, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;

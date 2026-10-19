/**
 * Reads for latvia-beneficial-owners (fleet #3332, Bruce's build-names
 * ruling #3329).
 *
 * Data comes from LR Uznemumu registrs (Latvia Enterprise Register),
 * publisher of the beneficial-owners open-data file. The register publishes
 * no live per-record API for this data -- only a bulk open-data file -- so
 * scripts/latvia-beneficial-owners/refresh.sh downloads it and loads it into
 * a D1 database the gateway hands this pack as `_d1` (pack-manifest
 * "d1Binding": "LV_UBO_DB"). Table/column names here must match
 * scripts/latvia-beneficial-owners/schema.sql.
 *
 * Loaded 2026-10-19 (Bruce, direct): pipeworx-lv-ubo-register holds 199,964
 * lv_beneficial_owners rows + lv_meta, verified table-count-matched against
 * the chunk-export manifest. Refreshed daily by
 * .github/workflows/latvia-beneficial-owners-refresh.yml (currently a
 * proposal under proposals/agent-config/ -- CLAUDE.md's agent-config-paths
 * push ruleset blocks a direct edit there).
 *
 * Reuse terms: CC0-1.0 (public domain dedication) -- published on
 * data.gov.lv. Every response here carries `source`, `licence` and
 * `data_as_of`.
 */

export interface D1Like {
  prepare(sql: string): D1StmtLike;
}
export interface D1StmtLike {
  bind(...values: unknown[]): D1StmtLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export const SOURCE = 'LR Uznemumu registrs (Latvia Enterprise Register), beneficial owners open data';
export const LICENCE = 'CC0-1.0 (public domain dedication) -- published on data.gov.lv.';

export class StoreUnavailableError extends Error {
  constructor() {
    super(
      'latvia-beneficial-owners: the register is not bound in this runtime (no _d1). These tools only answer through the Pipeworx gateway; a standalone install has no data to read.',
    );
    this.name = 'StoreUnavailableError';
  }
}
export function requireDb(d1: unknown): D1Like {
  if (!d1 || typeof (d1 as D1Like).prepare !== 'function') throw new StoreUnavailableError();
  return d1 as D1Like;
}

export async function dataAsOf(db: D1Like): Promise<string | null> {
  const r = await db.prepare(`SELECT value FROM lv_meta WHERE key = 'data_as_of'`).first<{ value: string }>();
  return r?.value ?? null;
}

export interface BeneficialOwnerRow {
  id: string;
  legal_entity_reg_number: string;
  forename: string | null;
  surname: string | null;
  personal_code_masked: string | null;
  birth_date: string | null;
  nationality: string | null;
  residence: string | null;
  registered_on: string | null;
  last_modified_at: string | null;
}

/** Every beneficial-owner row on file for one entity, by its Latvia
 *  registration number (unique_registration_number, e.g. "40003245752"). */
export async function findByEntity(db: D1Like, regNumber: string): Promise<BeneficialOwnerRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, legal_entity_reg_number, forename, surname, personal_code_masked, birth_date, nationality, residence, registered_on, last_modified_at
       FROM lv_beneficial_owners WHERE legal_entity_reg_number = ?`,
    )
    .bind(regNumber)
    .all<BeneficialOwnerRow>();
  return results;
}

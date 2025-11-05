// ABOUTME: Monitoring endpoints for tracking county processing and enrichment status
// ABOUTME: Provides visibility into which counties have been searched and enrichment queue state

import type { Database } from "./database";
import { getAllCounties } from "./counties";

export interface CountyStats {
  total: number;
  searched: number;
  pending: number;
  by_state: Record<string, { total: number; searched: number; pending: number }>;
}

export interface EnrichmentStats {
  pending: number;
  failed: number;
  permanently_failed: number;
}

export interface UnprocessedCounty {
  state: string;
  county_name: string;
  geoid: string;
}

export async function getCountyStats(db: Database): Promise<CountyStats> {
  const allCounties = await getAllCounties();

  const searchedCountiesResult = await db<Array<{ county_geoid: string; state: string }>>`
    SELECT DISTINCT county_geoid, state
    FROM county_searches
  `;

  const searchedSet = new Set(searchedCountiesResult.map(c => c.county_geoid));

  const byState: Record<string, { total: number; searched: number; pending: number }> = {};

  for (const county of allCounties) {
    if (!byState[county.state]) {
      byState[county.state] = { total: 0, searched: 0, pending: 0 };
    }

    byState[county.state].total++;

    if (searchedSet.has(county.geoid)) {
      byState[county.state].searched++;
    } else {
      byState[county.state].pending++;
    }
  }

  const totalSearched = searchedCountiesResult.length;
  const totalCounties = allCounties.length;

  return {
    total: totalCounties,
    searched: totalSearched,
    pending: totalCounties - totalSearched,
    by_state: byState,
  };
}

export async function getEnrichmentStats(db: Database): Promise<EnrichmentStats> {
  const pendingResult = await db<Array<{ count: string }>>`
    SELECT COUNT(*) as count
    FROM resources
    WHERE needs_enrichment = true
    AND (enrichment_failure_count < 3 OR enrichment_failure_count IS NULL)
    AND (enrichment_failure_reason IS NULL OR enrichment_failure_reason NOT LIKE '%Permanently closed%')
  `;

  const failedResult = await db<Array<{ count: string }>>`
    SELECT COUNT(*) as count
    FROM resources
    WHERE needs_enrichment = true
    AND enrichment_failure_count >= 1
    AND enrichment_failure_count < 3
  `;

  const permanentlyFailedResult = await db<Array<{ count: string }>>`
    SELECT COUNT(*) as count
    FROM resources
    WHERE enrichment_failure_count >= 3
    OR enrichment_failure_reason LIKE '%Permanently closed%'
  `;

  return {
    pending: parseInt(pendingResult[0]?.count || "0"),
    failed: parseInt(failedResult[0]?.count || "0"),
    permanently_failed: parseInt(permanentlyFailedResult[0]?.count || "0"),
  };
}

export async function getUnprocessedCounties(
  db: Database,
  state?: string
): Promise<UnprocessedCounty[]> {
  const allCounties = await getAllCounties();

  const searchedCountiesResult = await db<Array<{ county_geoid: string }>>`
    SELECT DISTINCT county_geoid
    FROM county_searches
  `;

  const searchedSet = new Set(searchedCountiesResult.map(c => c.county_geoid));

  let unprocessed = allCounties
    .filter(c => !searchedSet.has(c.geoid))
    .map(c => ({
      state: c.state,
      county_name: c.name,
      geoid: c.geoid,
    }));

  if (state) {
    unprocessed = unprocessed.filter(c => c.state === state.toUpperCase());
  }

  return unprocessed;
}

export async function getStateCountyStats(
  db: Database,
  state: string
): Promise<{
  state: string;
  total: number;
  searched: number;
  pending: number;
  searched_counties: Array<{ county_name: string; geoid: string; result_count: number }>;
  pending_counties: Array<{ county_name: string; geoid: string }>;
}> {
  const allCounties = await getAllCounties();
  const stateCounties = allCounties.filter(c => c.state === state.toUpperCase());

  const searchedCountiesResult = await db<Array<{ county_geoid: string; county_name: string; result_count: number }>>`
    SELECT county_geoid, county_name, result_count
    FROM county_searches
    WHERE state = ${state.toUpperCase()}
  `;

  const searchedSet = new Set(searchedCountiesResult.map(c => c.county_geoid));

  const pendingCounties = stateCounties
    .filter(c => !searchedSet.has(c.geoid))
    .map(c => ({
      county_name: c.name,
      geoid: c.geoid,
    }));

  return {
    state: state.toUpperCase(),
    total: stateCounties.length,
    searched: searchedCountiesResult.length,
    pending: pendingCounties.length,
    searched_counties: searchedCountiesResult.map(c => ({
      county_name: c.county_name,
      geoid: c.county_geoid,
      result_count: c.result_count,
    })),
    pending_counties: pendingCounties,
  };
}

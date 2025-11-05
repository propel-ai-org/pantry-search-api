// ABOUTME: County-based search functionality for food resources
// ABOUTME: Handles searching by county name/state with caching

import type { Database, FoodResource, CountySearch } from "./database";
import { searchWithOpenAI } from "./openai-search";
import { filterBySource } from "./source-filter";
import { enrichWithGooglePlaces } from "./google-places";
import type { County } from "./counties";

interface SearchResult {
  pantries: FoodResource[];
  banks: FoodResource[];
  mixed: FoodResource[];
  cached: boolean;
  search_timestamp: string;
}

const CACHE_EXPIRY_DAYS = 30;

export async function searchFoodResourcesByCounty(
  db: Database,
  county: County
): Promise<SearchResult> {
  // Check for cached results first
  const cachedResults = await getCachedCountyResults(db, county.geoid);
  if (cachedResults) {
    return cachedResults;
  }

  // Perform multiple searches to get comprehensive coverage
  console.log(`Performing fresh search for ${county.name}, ${county.state}`);

  const searches = [
    `food pantries food banks in ${county.name}, ${county.state}`,
    `list of food pantries ${county.name} ${county.state} directory`
  ];

  const allResults: Partial<FoodResource>[] = [];

  for (const query of searches) {
    console.log(`  Search: "${query}"`);
    const results = await searchWithOpenAI(query, "county");
    allResults.push(...results);
    // Small delay between searches
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`Combined results from ${searches.length} searches: ${allResults.length} total resources`);

  // Deduplicate results
  const uniqueResults = deduplicateResults(allResults);

  // Filter by source to exclude unreliable domains and names
  const filteredResults = filterBySource(uniqueResults);

  // Filter by geography - remove results that are in the wrong state
  const geoFilteredResults = filteredResults.filter((result) => {
    if (result.state && result.state.toUpperCase() !== county.state.toUpperCase()) {
      console.log(
        `Filtering out ${result.name} - wrong state (${result.state} instead of ${county.state})`
      );
      return false;
    }
    return true;
  });

  console.log(
    `${filteredResults.length} after name/source filtering, ${geoFilteredResults.length} after geographic filtering`
  );

  // Check against existing resources to avoid duplicate addresses
  const existingResources = await db<FoodResource[]>`
    SELECT name, address, latitude, longitude FROM resources
  `;

  const alreadyVerified = new Set(
    existingResources.map(
      (r) => r.address?.toLowerCase().trim() || ''
    )
  );

  const needsEnrichment = geoFilteredResults.filter((result) => {
    const key = result.address?.toLowerCase().trim() || '';
    return !alreadyVerified.has(key);
  });

  console.log(
    `${geoFilteredResults.length} unique results, ${geoFilteredResults.length - needsEnrichment.length} already in database, ${needsEnrichment.length} need storage`
  );

  // Store results without Google Places enrichment (mark as needing enrichment)
  console.log(`Storing ${needsEnrichment.length} results (enrichment will happen in background)...`);
  const storedResults = await storeCountyResults(db, needsEnrichment, county);

  // Record search
  await recordCountySearch(db, county, storedResults.length);

  return categorizeResults(storedResults, false);
}

async function getCachedCountyResults(
  db: Database,
  countyGeoid: string
): Promise<SearchResult | null> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - CACHE_EXPIRY_DAYS);

  // Check if we have a recent search for this county
  const recentSearch = await db<CountySearch[]>`
    SELECT * FROM county_searches
    WHERE county_geoid = ${countyGeoid}
    AND searched_at > ${expiryDate}
    ORDER BY searched_at DESC
    LIMIT 1
  `;

  if (recentSearch.length === 0) {
    return null;
  }

  // Get cached resources
  const resources = await db<FoodResource[]>`
    SELECT * FROM resources
    WHERE county_geoid = ${countyGeoid}
    ORDER BY name
  `;

  if (resources.length === 0) {
    return null;
  }

  console.log(`Using cached results for county: ${countyGeoid}`);
  return categorizeResults(resources, true);
}

function deduplicateResults(
  results: Partial<FoodResource>[]
): Partial<FoodResource>[] {
  const seen = new Map<string, Partial<FoodResource>>();

  for (const result of results) {
    // Deduplicate by address only - same physical location should only appear once
    const key = result.address?.toLowerCase().trim() || '';
    if (!seen.has(key) || !key) {
      seen.set(key, result);
    } else {
      // Keep the entry with the more descriptive name (longer is usually better)
      const existing = seen.get(key)!;
      if ((result.name?.length || 0) > (existing.name?.length || 0)) {
        seen.set(key, result);
      }
    }
  }

  return Array.from(seen.values());
}

async function storeCountyResults(
  db: Database,
  results: Partial<FoodResource>[],
  county: County
): Promise<FoodResource[]> {
  const stored: FoodResource[] = [];

  for (const result of results) {
    const inserted = await db<{ id: number }[]>`
      INSERT INTO resources (
        name, address, city, state, zip_code, county_name, county_geoid, location_type,
        latitude, longitude, type, phone, hours, rating, wait_time_minutes,
        eligibility_requirements, services_offered, languages_spoken, accessibility_notes,
        notes, is_verified, verification_notes, source_url, needs_enrichment
      ) VALUES (
        ${result.name || ""},
        ${result.address || ""},
        ${result.city || null},
        ${result.state || county.state},
        ${result.zip_code || null},
        ${county.name},
        ${county.geoid},
        ${"county"},
        ${result.latitude || null},
        ${result.longitude || null},
        ${result.type || "mixed"},
        ${result.phone || null},
        ${result.hours || null},
        ${result.rating || null},
        ${result.wait_time_minutes || null},
        ${result.eligibility_requirements || null},
        ${result.services_offered || null},
        ${result.languages_spoken || null},
        ${result.accessibility_notes || null},
        ${result.notes || null},
        ${result.is_verified || false},
        ${result.verification_notes || null},
        ${result.source_url || null},
        ${true}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      stored.push({ ...result, id: inserted[0].id } as FoodResource);
    }
  }

  return stored;
}

async function recordCountySearch(
  db: Database,
  county: County,
  resultCount: number
): Promise<void> {
  await db`
    INSERT INTO county_searches (county_geoid, county_name, state, result_count)
    VALUES (${county.geoid}, ${county.name}, ${county.state}, ${resultCount})
  `;
}

function categorizeResults(
  resources: FoodResource[],
  cached: boolean
): SearchResult {
  return {
    pantries: resources.filter((r) => r.type === "pantry"),
    banks: resources.filter((r) => r.type === "bank"),
    mixed: resources.filter((r) => r.type === "mixed"),
    cached,
    search_timestamp: new Date().toISOString(),
  };
}

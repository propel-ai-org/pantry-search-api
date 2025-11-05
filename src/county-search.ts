// ABOUTME: County-based search functionality for food resources
// ABOUTME: Handles searching by county name/state with caching

import type { Database, FoodResource, CountySearch } from "./database";
import { searchWithOpenAI } from "./openai-search";
import { searchGooglePlaces } from "./google-places-search";
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

  const allResults: Partial<FoodResource>[] = [];

  // 1. Search using Google Places API (most reliable for discovery)
  console.log(`\nSearching Google Places API...`);
  const googleResults = await searchGooglePlaces(county);
  allResults.push(...googleResults);
  console.log(`Google Places found ${googleResults.length} resources`);

  // 2. Search using OpenAI web search (catches resources not in Google Places)
  console.log(`\nSearching via OpenAI web search...`);
  const searches = [
    `food pantries food banks in ${county.name}, ${county.state}`,
    `list of food pantries ${county.name} ${county.state} directory`
  ];

  for (const query of searches) {
    console.log(`  Search: "${query}"`);
    const results = await searchWithOpenAI(query, "county");
    allResults.push(...results);
    // Small delay between searches
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\nCombined results: ${allResults.length} total resources from Google Places + OpenAI`);

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

  // Check against existing resources
  const existingResources = await db<FoodResource[]>`
    SELECT id, name, address, latitude, longitude, google_place_id, needs_enrichment, enrichment_failure_count FROM resources
  `;

  const existingByAddress = new Map<string, FoodResource>();
  for (const resource of existingResources) {
    const key = resource.address?.toLowerCase().trim() || '';
    if (key) {
      existingByAddress.set(key, resource);
    }
  }

  const needsStorage: Partial<FoodResource>[] = [];
  const needsUpdate: Array<{ id: number; data: Partial<FoodResource> }> = [];

  for (const result of geoFilteredResults) {
    const key = result.address?.toLowerCase().trim() || '';
    const existing = existingByAddress.get(key);

    if (!existing) {
      // New resource - store it
      needsStorage.push(result);
    } else if (shouldUpdateExisting(existing, result)) {
      // Better data available - update the existing record
      needsUpdate.push({ id: existing.id, data: result });
    }
    // else: existing record is good, skip this result
  }

  console.log(
    `${geoFilteredResults.length} unique results: ${needsStorage.length} new, ${needsUpdate.length} updates, ${geoFilteredResults.length - needsStorage.length - needsUpdate.length} skip (already have good data)`
  );

  // Update existing records with better data
  if (needsUpdate.length > 0) {
    console.log(`Updating ${needsUpdate.length} existing records with better data...`);
    await updateExistingResources(db, needsUpdate);
  }

  // Store new results
  console.log(`Storing ${needsStorage.length} new results (enrichment will happen in background)...`);
  const storedResults = await storeCountyResults(db, needsStorage, county);

  // Fetch all resources for this county to return (including updated ones)
  const allCountyResources = await db<FoodResource[]>`
    SELECT * FROM resources WHERE county_geoid = ${county.geoid}
  `;

  // Record search
  await recordCountySearch(db, county, needsStorage.length + needsUpdate.length);

  return categorizeResults(allCountyResources, false);
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
        notes, is_verified, verification_notes, source_url, google_place_id, needs_enrichment,
        url_facebook, url_twitter, url_instagram, url_youtube
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
        ${result.google_place_id || null},
        ${result.google_place_id ? false : true},
        ${result.url_facebook || null},
        ${result.url_twitter || null},
        ${result.url_instagram || null},
        ${result.url_youtube || null}
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

/**
 * Determine if we should update an existing resource with new data
 * Returns true if the new data is better than what we have
 */
function shouldUpdateExisting(
  existing: Partial<FoodResource>,
  newData: Partial<FoodResource>
): boolean {
  // If new data has Google Place ID and existing doesn't, update
  if (newData.google_place_id && !existing.google_place_id) {
    return true;
  }

  // If new data has coordinates and existing doesn't, update
  if (newData.latitude && newData.longitude && (!existing.latitude || !existing.longitude)) {
    return true;
  }

  // If existing needs enrichment and failed enrichment, and new data has better verification, update
  if (existing.needs_enrichment && existing.enrichment_failure_count && existing.enrichment_failure_count > 0) {
    if (newData.google_place_id || (newData.latitude && newData.longitude)) {
      return true;
    }
  }

  return false;
}

/**
 * Update existing resources with better data
 */
async function updateExistingResources(
  db: Database,
  updates: Array<{ id: number; data: Partial<FoodResource> }>
): Promise<void> {
  for (const { id, data } of updates) {
    await db`
      UPDATE resources SET
        name = ${data.name || null},
        address = ${data.address || null},
        city = ${data.city || null},
        state = ${data.state || null},
        zip_code = ${data.zip_code || null},
        latitude = ${data.latitude || null},
        longitude = ${data.longitude || null},
        type = ${data.type || "mixed"},
        phone = ${data.phone || null},
        hours = ${data.hours || null},
        rating = ${data.rating || null},
        source_url = ${data.source_url || null},
        google_place_id = ${data.google_place_id || null},
        is_verified = ${data.is_verified || false},
        verification_notes = ${data.verification_notes || null},
        needs_enrichment = ${false},
        enrichment_failure_count = ${0},
        enrichment_failure_reason = ${null},
        last_enrichment_attempt = ${new Date()},
        url_facebook = ${data.url_facebook || null},
        url_twitter = ${data.url_twitter || null},
        url_instagram = ${data.url_instagram || null},
        url_youtube = ${data.url_youtube || null}
      WHERE id = ${id}
    `;
  }
}

// ABOUTME: County-based search functionality for food resources
// ABOUTME: Handles searching by county name/state with caching

import type { Database } from "bun:sqlite";
import type { FoodResource, CountySearch } from "./database";
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
  const cachedResults = getCachedCountyResults(db, county.geoid);
  if (cachedResults) {
    return cachedResults;
  }

  // Perform fresh search using OpenAI web search
  console.log(`Performing fresh search for ${county.name}, ${county.state}`);

  const searchQuery = `${county.name}, ${county.state}`;
  const searchResults = await searchWithOpenAI(searchQuery, "county");

  // Deduplicate results
  const uniqueResults = deduplicateResults(searchResults);

  // Filter by source to exclude unreliable domains
  const filteredResults = filterBySource(uniqueResults);

  // Enrich with Google Places API (this filters out places we can't verify)
  console.log(`Enriching ${filteredResults.length} results with Google Places...`);
  const enrichedResults: Partial<FoodResource>[] = [];
  for (const result of filteredResults) {
    const enriched = await enrichWithGooglePlaces(result);
    if (enriched) {
      enrichedResults.push(enriched);
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `Successfully enriched ${enrichedResults.length}/${filteredResults.length} results`
  );

  // Store results in database
  const storedResults = storeCountyResults(db, enrichedResults, county);

  // Record search
  recordCountySearch(db, county, storedResults.length);

  return categorizeResults(storedResults, false);
}

function getCachedCountyResults(
  db: Database,
  countyGeoid: string
): SearchResult | null {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - CACHE_EXPIRY_DAYS);
  const expiryTimestamp = expiryDate.toISOString();

  // Check if we have a recent search for this county
  const recentSearch = db
    .query<CountySearch, string>(
      `SELECT * FROM county_searches
       WHERE county_geoid = ?
       AND searched_at > ?
       ORDER BY searched_at DESC
       LIMIT 1`
    )
    .get(countyGeoid, expiryTimestamp);

  if (!recentSearch) {
    return null;
  }

  // Get cached resources
  const resources = db
    .query<FoodResource, string>(
      `SELECT * FROM resources
       WHERE county_geoid = ?
       ORDER BY name`
    )
    .all(countyGeoid);

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
    const key = `${result.name?.toLowerCase()}-${result.address?.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, result);
    }
  }

  return Array.from(seen.values());
}

function storeCountyResults(
  db: Database,
  results: Partial<FoodResource>[],
  county: County
): FoodResource[] {
  const stored: FoodResource[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO resources (
      name, address, city, state, zip_code, county_name, county_geoid, location_type,
      latitude, longitude, type, phone, hours, rating, wait_time_minutes,
      eligibility_requirements, services_offered, languages_spoken, accessibility_notes,
      notes, is_verified, verification_notes, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of results) {
    insertStmt.run(
      result.name || "",
      result.address || "",
      result.city || null,
      result.state || county.state,
      result.zip_code || null,
      county.name,
      county.geoid,
      "county",
      result.latitude || null,
      result.longitude || null,
      result.type || "mixed",
      result.phone || null,
      result.hours || null,
      result.rating || null,
      result.wait_time_minutes || null,
      result.eligibility_requirements || null,
      result.services_offered || null,
      result.languages_spoken || null,
      result.accessibility_notes || null,
      result.notes || null,
      result.is_verified ? 1 : 0,
      result.verification_notes || null,
      result.source_url || null
    );

    const id = db.query("SELECT last_insert_rowid() as id").get() as {
      id: number;
    };
    stored.push({ ...result, id: id.id } as FoodResource);
  }

  return stored;
}

function recordCountySearch(
  db: Database,
  county: County,
  resultCount: number
): void {
  db.run(
    `INSERT INTO county_searches (county_geoid, county_name, state, result_count)
     VALUES (?, ?, ?, ?)`,
    [county.geoid, county.name, county.state, resultCount]
  );
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

// ABOUTME: Search functionality for finding and verifying food resources
// ABOUTME: Handles web search, result parsing, caching, and verification logic

import type { Database, FoodResource } from "../core/database";
import { searchWithOpenAI } from "./openai-search";
import { filterBySource } from "../utils/source-filter";
import { enrichWithGooglePlaces } from "../enrichment/google-places";

interface SearchResult {
  pantries: FoodResource[];
  banks: FoodResource[];
  mixed: FoodResource[];
  cached: boolean;
  search_timestamp: string;
}

const CACHE_EXPIRY_DAYS = 30;

export async function searchFoodResources(
  db: Database,
  zipCode: string
): Promise<SearchResult> {
  // Check for cached results first
  const cachedResults = await getCachedResults(db, zipCode);
  if (cachedResults) {
    return cachedResults;
  }

  // Perform fresh search using OpenAI web search
  console.log(`Performing fresh search for zip code: ${zipCode}`);

  const searchResults = await searchWithOpenAI(zipCode, "zip");

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
  const storedResults = await storeResults(db, enrichedResults, zipCode);

  // Record search
  await recordSearch(db, zipCode, storedResults.length);

  return categorizeResults(storedResults, false);
}

async function getCachedResults(
  db: Database,
  zipCode: string
): Promise<SearchResult | null> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - CACHE_EXPIRY_DAYS);

  // Check if we have a recent search for this zip
  const recentSearch = await db<ZipSearch[]>`
    SELECT * FROM zip_searches
    WHERE zip_code = ${zipCode}
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
    WHERE zip_code = ${zipCode}
    ORDER BY name
  `;

  if (resources.length === 0) {
    return null;
  }

  console.log(`Using cached results for zip code: ${zipCode}`);
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

async function storeResults(
  db: Database,
  results: Partial<FoodResource>[],
  zipCode: string
): Promise<FoodResource[]> {
  const stored: FoodResource[] = [];

  for (const result of results) {
    const inserted = await db<{ id: number }[]>`
      INSERT INTO resources (
        name, address, city, state, zip_code, latitude, longitude,
        type, phone, hours, rating, wait_time_minutes, eligibility_requirements,
        services_offered, languages_spoken, accessibility_notes, notes,
        is_verified, verification_notes, source_url, location_type
      ) VALUES (
        ${result.name || ""},
        ${result.address || ""},
        ${result.city || null},
        ${result.state || null},
        ${zipCode},
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
        ${"zip"}
      )
      RETURNING id
    `;

    if (inserted.length > 0) {
      stored.push({ ...result, id: inserted[0].id } as FoodResource);
    }
  }

  return stored;
}

async function recordSearch(db: Database, zipCode: string, resultCount: number): Promise<void> {
  await db`
    INSERT INTO zip_searches (zip_code, result_count) VALUES (${zipCode}, ${resultCount})
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

interface ZipSearch {
  id: number;
  zip_code: string;
  searched_at: string;
  result_count: number;
}

// ABOUTME: Search functionality for finding and verifying food resources
// ABOUTME: Handles web search, result parsing, caching, and verification logic

import type { Database } from "bun:sqlite";
import type { FoodResource } from "./database";
import { searchWithOpenAI } from "./openai-search";
import { filterBySource } from "./source-filter";

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
  const cachedResults = getCachedResults(db, zipCode);
  if (cachedResults) {
    return cachedResults;
  }

  // Perform fresh search using OpenAI web search
  console.log(`Performing fresh search for zip code: ${zipCode}`);

  const searchResults = await searchWithOpenAI(zipCode);

  // Deduplicate results
  const uniqueResults = deduplicateResults(searchResults);

  // Filter by source to exclude unreliable domains
  const filteredResults = filterBySource(uniqueResults);

  // Store results in database
  const storedResults = storeResults(db, filteredResults, zipCode);

  // Record search
  recordSearch(db, zipCode, storedResults.length);

  return categorizeResults(storedResults, false);
}

function getCachedResults(
  db: Database,
  zipCode: string
): SearchResult | null {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - CACHE_EXPIRY_DAYS);
  const expiryTimestamp = expiryDate.toISOString();

  // Check if we have a recent search for this zip
  const recentSearch = db
    .query<ZipSearch, string>(
      `SELECT * FROM zip_searches
       WHERE zip_code = ?
       AND searched_at > ?
       ORDER BY searched_at DESC
       LIMIT 1`
    )
    .get(zipCode, expiryTimestamp);

  if (!recentSearch) {
    return null;
  }

  // Get cached resources
  const resources = db
    .query<FoodResource, string>(
      `SELECT * FROM resources
       WHERE zip_code = ?
       ORDER BY name`
    )
    .all(zipCode);

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
    const key = `${result.name?.toLowerCase()}-${result.address?.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, result);
    }
  }

  return Array.from(seen.values());
}

function storeResults(
  db: Database,
  results: Partial<FoodResource>[],
  zipCode: string
): FoodResource[] {
  const stored: FoodResource[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO resources (
      name, address, city, state, zip_code, latitude, longitude,
      type, phone, hours, notes, is_verified, verification_notes, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of results) {
    insertStmt.run(
      result.name || "",
      result.address || "",
      result.city || null,
      result.state || null,
      zipCode,
      result.latitude || null,
      result.longitude || null,
      result.type || "mixed",
      result.phone || null,
      result.hours || null,
      result.notes || null,
      result.is_verified ? 1 : 0,
      result.verification_notes || null,
      result.source_url || null
    );

    const id = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
    stored.push({ ...result, id: id.id } as FoodResource);
  }

  return stored;
}

function recordSearch(db: Database, zipCode: string, resultCount: number): void {
  db.run(
    `INSERT INTO zip_searches (zip_code, result_count) VALUES (?, ?)`,
    [zipCode, resultCount]
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

interface ZipSearch {
  id: number;
  zip_code: string;
  searched_at: string;
  result_count: number;
}

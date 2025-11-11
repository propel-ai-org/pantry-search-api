// ABOUTME: Fast parallel backfill of missing Google Place IDs
// ABOUTME: Only fetches place_id without full enrichment, runs in batches

import { initDatabase } from '../src/core/database.ts';
import type { FoodResource } from '../src/core/database.ts';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 100;

if (!GOOGLE_PLACES_API_KEY) {
  console.error('GOOGLE_MAPS_API_KEY is required');
  process.exit(1);
}

interface PlaceIdResult {
  placeId: string | null;
  method: 'places' | 'geocode';
  error?: string;
}

async function getPlaceId(resource: FoodResource): Promise<PlaceIdResult> {
  // Build search query
  const parts: string[] = [];
  if (resource.name) parts.push(resource.name);
  if (resource.address && resource.address !== "Not specified") parts.push(resource.address);
  if (resource.city && resource.city !== "Not specified") parts.push(resource.city);
  if (resource.state) parts.push(resource.state);
  const query = parts.join(" ");

  try {
    // Try Google Places first
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${GOOGLE_PLACES_API_KEY}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (searchData.status === "OK" && searchData.candidates?.length > 0) {
      return { placeId: searchData.candidates[0].place_id, method: 'places' };
    }

    // Fall back to geocoding
    const addressParts: string[] = [];
    if (resource.address) addressParts.push(resource.address);
    if (resource.city) addressParts.push(resource.city);
    if (resource.state) addressParts.push(resource.state);
    if (resource.zip_code) addressParts.push(resource.zip_code);
    const fullAddress = addressParts.join(", ");

    if (!fullAddress) {
      return { placeId: null, error: 'No address to geocode' };
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_PLACES_API_KEY}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status === "OK" && geocodeData.results?.length > 0) {
      return { placeId: geocodeData.results[0].place_id, method: 'geocode' };
    }

    return { placeId: null, error: `Geocoding failed: ${geocodeData.status}` };
  } catch (error) {
    return { placeId: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function processBatch(resources: FoodResource[], db: any): Promise<{ success: number, failed: number }> {
  const promises = resources.map(resource => getPlaceId(resource));
  const results = await Promise.all(promises);

  let batchSuccess = 0;
  let batchFailed = 0;

  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    const result = results[i];

    if (result.placeId) {
      await db`
        UPDATE resources
        SET
          google_place_id = ${result.placeId},
          needs_enrichment = false,
          last_enrichment_attempt = CURRENT_TIMESTAMP,
          enrichment_failure_count = 0,
          enrichment_failure_reason = NULL
        WHERE id = ${resource.id}
      `;
      batchSuccess++;
      console.log(`  ✅ ${resource.name}: ${result.placeId} (via ${result.method})`);
    } else {
      await db`
        UPDATE resources
        SET
          last_enrichment_attempt = CURRENT_TIMESTAMP,
          enrichment_failure_count = ${(resource.enrichment_failure_count || 0) + 1},
          enrichment_failure_reason = ${result.error || 'Unknown error'}
        WHERE id = ${resource.id}
      `;
      batchFailed++;
      console.log(`  ❌ ${resource.name}: ${result.error}`);
    }
  }

  return { success: batchSuccess, failed: batchFailed };
}

const db = await initDatabase();

console.log('Finding exportable resources missing Google Place IDs...\n');

const missingPlaceIds = await db<FoodResource[]>`
  SELECT * FROM resources
  WHERE exportable = true
    AND source_url IS NOT NULL
    AND (address IS NOT NULL AND address != 'Not specified')
    AND (google_place_id IS NULL OR google_place_id = '')
  ORDER BY created_at DESC
`;

console.log(`Found ${missingPlaceIds.length} resources missing place_ids\n`);
console.log(`Processing in batches of ${BATCH_SIZE}...\n`);

if (missingPlaceIds.length === 0) {
  console.log('No resources need place_id backfill. Exiting.');
  await db.end();
  process.exit(0);
}

let totalSuccess = 0;
let totalFailed = 0;

for (let i = 0; i < missingPlaceIds.length; i += BATCH_SIZE) {
  const batch = missingPlaceIds.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(missingPlaceIds.length / BATCH_SIZE);

  console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} resources...`);

  const { success, failed } = await processBatch(batch, db);
  totalSuccess += success;
  totalFailed += failed;

  // Show running totals every 10 batches
  if (batchNum % 10 === 0) {
    const processed = i + batch.length;
    console.log(`\n📊 Progress: ${processed}/${missingPlaceIds.length} (${totalSuccess} success, ${totalFailed} failed)`);
  }

  // Rate limiting between batches
  if (i + BATCH_SIZE < missingPlaceIds.length) {
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Final Results:');
console.log('='.repeat(80));
console.log(`Total processed: ${missingPlaceIds.length}`);
console.log(`✅ Success: ${totalSuccess} (${((totalSuccess / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log(`❌ Failed: ${totalFailed} (${((totalFailed / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log('='.repeat(80));

await db.end();

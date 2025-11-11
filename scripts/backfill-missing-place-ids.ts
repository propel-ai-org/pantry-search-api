// ABOUTME: Backfill missing Google Place IDs for exportable resources with addresses
// ABOUTME: Uses Google Places API to find place_id for resources that have coordinates but no place_id

import { initDatabase } from '../src/core/database.ts';
import { enrichWithGooglePlaces } from '../src/enrichment/google-places.ts';
import type { FoodResource } from '../src/core/database.ts';

const db = await initDatabase();

console.log('Finding exportable resources missing Google Place IDs...\n');

// Get all exportable resources with addresses but missing place_id
const missingPlaceIds = await db<FoodResource[]>`
  SELECT * FROM resources
  WHERE exportable = true
    AND source_url IS NOT NULL
    AND (address IS NOT NULL AND address != 'Not specified')
    AND (google_place_id IS NULL OR google_place_id = '')
  ORDER BY created_at DESC
`;

console.log(`Found ${missingPlaceIds.length} resources missing place_ids\n`);

if (missingPlaceIds.length === 0) {
  console.log('No resources need place_id backfill. Exiting.');
  await db.end();
  process.exit(0);
}

let successCount = 0;
let failedCount = 0;
let skippedCount = 0;
let alreadyClosedCount = 0;

for (let i = 0; i < missingPlaceIds.length; i++) {
  const resource = missingPlaceIds[i];
  const progress = `[${i + 1}/${missingPlaceIds.length}]`;

  console.log(`${progress} Processing: ${resource.name}`);
  console.log(`  Address: ${resource.address}, ${resource.city}, ${resource.state}`);

  try {
    const result = await enrichWithGooglePlaces(resource);

    if (result.data && result.data.google_place_id) {
      // Update the resource with place_id and any other enriched data
      await db`
        UPDATE resources
        SET
          name = ${result.data.name || resource.name},
          address = ${result.data.address || resource.address},
          city = ${result.data.city || resource.city},
          state = ${result.data.state || resource.state},
          zip_code = ${result.data.zip_code || resource.zip_code},
          latitude = ${result.data.latitude || resource.latitude},
          longitude = ${result.data.longitude || resource.longitude},
          phone = ${result.data.phone || resource.phone},
          hours = ${result.data.hours || resource.hours},
          rating = ${result.data.rating || resource.rating},
          source_url = ${result.data.source_url || resource.source_url},
          google_place_id = ${result.data.google_place_id},
          verification_notes = ${result.data.verification_notes || resource.verification_notes},
          wheelchair_accessible = ${result.data.wheelchair_accessible ?? resource.wheelchair_accessible},
          has_curbside_pickup = ${result.data.has_curbside_pickup ?? resource.has_curbside_pickup},
          has_delivery = ${result.data.has_delivery ?? resource.has_delivery},
          has_takeout = ${result.data.has_takeout ?? resource.has_takeout},
          editorial_summary = ${result.data.editorial_summary || resource.editorial_summary},
          url_facebook = ${result.data.url_facebook || resource.url_facebook},
          url_twitter = ${result.data.url_twitter || resource.url_twitter},
          url_instagram = ${result.data.url_instagram || resource.url_instagram},
          url_youtube = ${result.data.url_youtube || resource.url_youtube},
          needs_enrichment = false,
          last_enrichment_attempt = CURRENT_TIMESTAMP,
          enrichment_failure_count = 0,
          enrichment_failure_reason = NULL
        WHERE id = ${resource.id}
      `;

      successCount++;
      const method = result.data.verification_notes?.includes('Geocoding API') ? 'geocode' : 'Places API';
      console.log(`  ✅ Success: place_id = ${result.data.google_place_id} (via ${method})\n`);
    } else {
      // Check if permanently closed - mark as unexportable
      if (result.failureReason === 'Permanently closed') {
        await db`
          UPDATE resources
          SET
            exportable = false,
            last_enrichment_attempt = CURRENT_TIMESTAMP,
            enrichment_failure_count = ${(resource.enrichment_failure_count || 0) + 1},
            enrichment_failure_reason = ${result.failureReason}
          WHERE id = ${resource.id}
        `;
        alreadyClosedCount++;
        console.log(`  ❌ Failed: ${result.failureReason} (marked unexportable)\n`);
      } else {
        // Update failure count for other failures
        const failureCount = (resource.enrichment_failure_count || 0) + 1;
        await db`
          UPDATE resources
          SET
            last_enrichment_attempt = CURRENT_TIMESTAMP,
            enrichment_failure_count = ${failureCount},
            enrichment_failure_reason = ${result.failureReason || 'Unknown error'}
          WHERE id = ${resource.id}
        `;
        failedCount++;
        console.log(`  ❌ Failed: ${result.failureReason}\n`);
      }
    }
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    skippedCount++;
  }

  // Rate limiting - wait 100ms between requests to respect API limits
  if (i < missingPlaceIds.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Show progress every 100 resources
  if ((i + 1) % 100 === 0) {
    console.log(`\n📊 Progress: ${i + 1}/${missingPlaceIds.length} processed (${successCount} success, ${failedCount} failed, ${alreadyClosedCount} closed, ${skippedCount} errors)\n`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Final Results:');
console.log('='.repeat(80));
console.log(`Total processed: ${missingPlaceIds.length}`);
console.log(`✅ Success: ${successCount} (${((successCount / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failedCount} (${((failedCount / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log(`🚫 Permanently closed: ${alreadyClosedCount} (${((alreadyClosedCount / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log(`⚠️  Errors: ${skippedCount} (${((skippedCount / missingPlaceIds.length) * 100).toFixed(1)}%)`);
console.log('='.repeat(80));

await db.end();

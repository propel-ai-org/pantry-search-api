// ABOUTME: Retry geocoding for all exportable resources missing lat/long
// ABOUTME: Uses new geocoding fallback to heal previously failed resources

import { initDatabase } from '../src/core/database.ts';
import { enrichWithGooglePlaces } from '../src/enrichment/google-places.ts';
import type { FoodResource } from '../src/core/database.ts';

const db = await initDatabase();

console.log('Finding exportable resources missing lat/long...\n');

// Get all exportable resources missing lat/long
const missingGeocode = await db<FoodResource[]>`
  SELECT * FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL OR latitude::text = '' OR longitude::text = '')
  ORDER BY created_at DESC
`;

console.log(`Found ${missingGeocode.length} resources needing geocoding\n`);

if (missingGeocode.length === 0) {
  console.log('No resources need geocoding. Exiting.');
  await db.end();
  process.exit(0);
}

let successCount = 0;
let failedCount = 0;
let skippedCount = 0;

for (let i = 0; i < missingGeocode.length; i++) {
  const resource = missingGeocode[i];
  const progress = `[${i + 1}/${missingGeocode.length}]`;

  console.log(`${progress} Processing: ${resource.name}`);
  console.log(`  Address: ${resource.address}, ${resource.city}, ${resource.state}`);

  try {
    const result = await enrichWithGooglePlaces(resource);

    if (result.data && result.data.latitude && result.data.longitude) {
      // Update the resource with geocoded data
      await db`
        UPDATE resources
        SET
          name = ${result.data.name || resource.name},
          latitude = ${result.data.latitude},
          longitude = ${result.data.longitude},
          city = ${result.data.city || resource.city},
          state = ${result.data.state || resource.state},
          zip_code = ${result.data.zip_code || resource.zip_code},
          verification_notes = ${result.data.verification_notes || resource.verification_notes},
          needs_enrichment = false,
          last_enrichment_attempt = CURRENT_TIMESTAMP,
          enrichment_failure_count = 0,
          enrichment_failure_reason = NULL
        WHERE id = ${resource.id}
      `;

      successCount++;
      const nameChange = result.data.name !== resource.name ? ` (name updated to: ${result.data.name})` : '';
      console.log(`  ✅ Success: (${result.data.latitude}, ${result.data.longitude})${nameChange}\n`);
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
        failedCount++;
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

  // Rate limiting - wait 100ms between requests
  if (i < missingGeocode.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Show progress every 100 resources
  if ((i + 1) % 100 === 0) {
    console.log(`\n📊 Progress: ${i + 1}/${missingGeocode.length} processed (${successCount} success, ${failedCount} failed, ${skippedCount} errors)\n`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Final Results:');
console.log('='.repeat(80));
console.log(`Total processed: ${missingGeocode.length}`);
console.log(`✅ Success: ${successCount} (${((successCount / missingGeocode.length) * 100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failedCount} (${((failedCount / missingGeocode.length) * 100).toFixed(1)}%)`);
console.log(`⚠️  Errors: ${skippedCount} (${((skippedCount / missingGeocode.length) * 100).toFixed(1)}%)`);
console.log('='.repeat(80));

await db.end();

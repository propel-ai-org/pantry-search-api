// ABOUTME: Test script for geocoding fallback functionality
// ABOUTME: Verifies that failed enrichments can now succeed with geocoding

import { initDatabase } from '../src/core/database.ts';
import { enrichWithGooglePlaces } from '../src/enrichment/google-places.ts';
import type { FoodResource } from '../src/core/database.ts';

const db = await initDatabase();

// Get a few failed resources with different failure reasons
const testResources = await db<FoodResource[]>`
  SELECT * FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL)
    AND enrichment_failure_count >= 3
  LIMIT 5
`;

console.log(`Testing geocoding fallback on ${testResources.length} resources\n`);

for (const resource of testResources) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${resource.name}`);
  console.log(`Address: ${resource.address}, ${resource.city}, ${resource.state}`);
  console.log(`Previous failure: ${resource.enrichment_failure_reason}`);
  console.log(`${'='.repeat(80)}`);

  const result = await enrichWithGooglePlaces(resource);

  if (result.data && result.data.latitude && result.data.longitude) {
    console.log(`\n✅ SUCCESS: Got lat/long: ${result.data.latitude}, ${result.data.longitude}`);
    console.log(`   Verification notes: ${result.data.verification_notes}`);
  } else {
    console.log(`\n❌ FAILED: ${result.failureReason}`);
  }

  // Small delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 200));
}

await db.end();

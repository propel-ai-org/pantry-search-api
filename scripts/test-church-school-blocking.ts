// ABOUTME: Test script for church/school blocking with food indicators
// ABOUTME: Verifies that churches/schools with food pantries are accepted

import { initDatabase } from '../src/core/database.ts';
import { enrichWithGooglePlaces } from '../src/enrichment/google-places.ts';
import type { FoodResource } from '../src/core/database.ts';

const db = await initDatabase();

// Get some church/school resources that were previously blocked
const testResources = await db<FoodResource[]>`
  SELECT * FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL)
    AND (enrichment_failure_reason LIKE '%Blocked type: %school%'
         OR enrichment_failure_reason LIKE '%Blocked type: %church%')
  LIMIT 3
`;

console.log(`Testing church/school blocking on ${testResources.length} resources\n`);

for (const resource of testResources) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${resource.name}`);
  console.log(`Address: ${resource.address}, ${resource.city}, ${resource.state}`);
  console.log(`Previous failure: ${resource.enrichment_failure_reason}`);
  console.log(`${'='.repeat(80)}`);

  const result = await enrichWithGooglePlaces(resource);

  if (result.data && result.data.latitude && result.data.longitude) {
    console.log(`\n✅ SUCCESS: Got full enrichment`);
    console.log(`   Name: ${result.data.name || resource.name}`);
    console.log(`   Lat/Long: ${result.data.latitude}, ${result.data.longitude}`);
    console.log(`   Google Place ID: ${result.data.google_place_id}`);
    console.log(`   Verification notes: ${result.data.verification_notes}`);
  } else {
    console.log(`\n❌ FAILED: ${result.failureReason}`);
  }

  await new Promise(resolve => setTimeout(resolve, 200));
}

await db.end();

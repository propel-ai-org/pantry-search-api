// ABOUTME: Investigate why exportable resources are missing Google Place IDs
// ABOUTME: Analyzes enrichment history and patterns to identify root cause

import { initDatabase } from '../src/core/database.ts';

const db = await initDatabase();

// Find resources that were verified via Google Places but don't have place_id
const missingPlaceId = await db`
  SELECT id, name, address, city, state, verification_notes, google_place_id
  FROM resources 
  WHERE exportable = true 
    AND verification_notes LIKE '%Google Places API%'
    AND (google_place_id IS NULL OR google_place_id = '')
  LIMIT 30
`;

console.log(`Resources verified via Google Places API but missing place_id: ${missingPlaceId.length}\n`);

missingPlaceId.slice(0, 10).forEach(r => {
  console.log(`${r.id}: ${r.name} - ${r.address}, ${r.city}, ${r.state}`);
  console.log(`  place_id: "${r.google_place_id}", notes: ${r.verification_notes}\n`);
});

// Check if this is a code issue - do ANY resources from enrichment have place_ids?
const withPlaceId = await db`
  SELECT COUNT(*) as count
  FROM resources 
  WHERE exportable = true 
    AND verification_notes LIKE '%Google Places API%'
    AND google_place_id IS NOT NULL
    AND google_place_id != ''
`;

console.log(`Resources verified via Google Places API WITH place_id: ${withPlaceId[0].count}`);

// Get a sample of those WITH place_id to compare
const samplesWithPlaceId = await db`
  SELECT id, name, verification_notes, google_place_id, last_enrichment_attempt
  FROM resources 
  WHERE exportable = true 
    AND verification_notes LIKE '%Google Places API%'
    AND google_place_id IS NOT NULL
    AND google_place_id != ''
  ORDER BY last_enrichment_attempt DESC
  LIMIT 5
`;

console.log('\nSample resources WITH place_id:');
samplesWithPlaceId.forEach(r => {
  console.log(`  ${r.id}: ${r.name}`);
  console.log(`     place_id: ${r.google_place_id}, last_enriched: ${r.last_enrichment_attempt}`);
});

await db.end();

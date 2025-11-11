// ABOUTME: Check status of exportable resources missing lat/long
// ABOUTME: Analyzes why geocoding failed and provides examples

import { initDatabase } from '../src/core/database.ts';

const db = await initDatabase();

// Count exportable resources without lat/long
const missing = await db`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN needs_enrichment THEN 1 ELSE 0 END) as needs_enrichment,
    SUM(CASE WHEN enrichment_failure_count >= 3 THEN 1 ELSE 0 END) as failed_3_times,
    SUM(CASE WHEN enrichment_failure_reason IS NOT NULL THEN 1 ELSE 0 END) as has_failure_reason
  FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL OR latitude::text = '' OR longitude::text = '')
`;

console.log('Exportable resources missing lat/long:', JSON.stringify(missing[0], null, 2));

// Get a few examples with their failure reasons
const examples = await db`
  SELECT id, name, address, city, state, needs_enrichment, enrichment_failure_count, enrichment_failure_reason, last_enrichment_attempt
  FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL OR latitude::text = '' OR longitude::text = '')
  LIMIT 10
`;

console.log('\nExamples:');
examples.forEach(r => {
  console.log(`${r.id}: ${r.name} - ${r.address}, ${r.city}, ${r.state}`);
  console.log(`  needs_enrichment: ${r.needs_enrichment}, failures: ${r.enrichment_failure_count}`);
  console.log(`  reason: ${r.enrichment_failure_reason}`);
  console.log(`  last_attempt: ${r.last_enrichment_attempt}`);
  console.log('');
});

// Group by failure reason
const byReason = await db`
  SELECT
    enrichment_failure_reason,
    COUNT(*) as count
  FROM resources
  WHERE exportable = true
    AND (latitude IS NULL OR longitude IS NULL OR latitude::text = '' OR longitude::text = '')
    AND enrichment_failure_reason IS NOT NULL
  GROUP BY enrichment_failure_reason
  ORDER BY count DESC
`;

console.log('\nFailure reasons:');
byReason.forEach(r => {
  console.log(`  ${r.enrichment_failure_reason}: ${r.count}`);
});

await db.end();

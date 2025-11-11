// ABOUTME: Check how many exportable resources are still missing place_ids
// ABOUTME: Quick verification script after backfill

import { initDatabase } from '../src/core/database.ts';

const db = await initDatabase();

const results = await db<Array<{ total_exportable: number, has_place_id: number, missing_place_id: number }>>`
  SELECT
    COUNT(*) as total_exportable,
    COUNT(google_place_id) as has_place_id,
    COUNT(*) FILTER (WHERE google_place_id IS NULL OR google_place_id = '') as missing_place_id
  FROM resources
  WHERE exportable = true
    AND source_url IS NOT NULL
    AND (address IS NOT NULL AND address != 'Not specified')
`;

const stats = results[0];

console.log('\n' + '='.repeat(80));
console.log('📊 Place ID Coverage for Exportable Resources:');
console.log('='.repeat(80));
console.log(`Total exportable resources with addresses: ${stats.total_exportable}`);
console.log(`Resources with place_id: ${stats.has_place_id} (${((stats.has_place_id / stats.total_exportable) * 100).toFixed(1)}%)`);
console.log(`Resources missing place_id: ${stats.missing_place_id} (${((stats.missing_place_id / stats.total_exportable) * 100).toFixed(1)}%)`);
console.log('='.repeat(80));

if (stats.missing_place_id === 0) {
  console.log('✅ All exportable resources now have place_ids!\n');
} else {
  console.log(`⚠️  ${stats.missing_place_id} resources still missing place_ids\n`);
}

await db.end();

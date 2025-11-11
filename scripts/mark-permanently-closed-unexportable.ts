// ABOUTME: Mark permanently closed resources as unexportable
// ABOUTME: Cleanup script for existing resources marked as permanently closed

import { initDatabase } from '../src/core/database.ts';

const db = await initDatabase();

console.log('Finding resources marked as permanently closed...\n');

// Find all resources with "Permanently closed" failure reason
const permanentlyClosed = await db`
  SELECT id, name, enrichment_failure_reason
  FROM resources
  WHERE enrichment_failure_reason = 'Permanently closed'
    AND exportable = true
`;

console.log(`Found ${permanentlyClosed.length} permanently closed resources that are still exportable\n`);

if (permanentlyClosed.length === 0) {
  console.log('No resources to update. Exiting.');
  await db.end();
  process.exit(0);
}

// Show a few examples
console.log('Examples:');
permanentlyClosed.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.name}`);
});
if (permanentlyClosed.length > 5) {
  console.log(`  ... and ${permanentlyClosed.length - 5} more\n`);
}

// Mark them as unexportable
const result = await db`
  UPDATE resources
  SET exportable = false
  WHERE enrichment_failure_reason = 'Permanently closed'
    AND exportable = true
  RETURNING id
`;

console.log(`\n✅ Marked ${result.length} permanently closed resources as unexportable`);

await db.end();

// ABOUTME: Removes government offices that aren't food distribution sites
// ABOUTME: Filters out procurement, public works, administration, etc.

import { initDatabase } from "../src/core/database";

async function cleanupGovernmentOffices() {
  const db = await initDatabase();

  // Patterns for government offices that aren't food distribution
  const patterns = [
    'procurement',
    'public works',
    'administration',
    'borough office',
    'city office',
    'county office',
    'government office',
    'municipal',
    'clerk',
    'treasurer',
    'assessor',
    'sheriff',
    'police',
    'fire department',
    'utilities',
    'planning',
    'zoning',
    'building department',
    'health department', // unless it specifically mentions food
    'social services', // unless it specifically mentions food
    'dmv',
    'motor vehicle',
    'parks department',
    'recreation department',
  ];

  console.log("Finding government offices that aren't food sites...\n");

  const resources = await db`
    SELECT id, name, address, city, state
    FROM resources
    WHERE LOWER(name) SIMILAR TO ${`%(${patterns.join('|')})%`}
      AND LOWER(name) NOT SIMILAR TO '%(food|meal|pantry|kitchen|nutrition|snap|wic)%'
    ORDER BY name
  `;

  console.log(`Found ${resources.length} potential government offices to review:\n`);

  for (const r of resources) {
    console.log(`${r.id}. ${r.name}`);
    console.log(`   ${r.address}, ${r.city}, ${r.state}`);
  }

  if (resources.length === 0) {
    console.log("\nNo government offices found!");
    await db.end();
    return;
  }

  console.log(`\nReady to delete ${resources.length} resources.`);
  console.log("Press Ctrl+C to cancel, or Enter to proceed...");

  // Wait for user confirmation
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  // Delete them
  const ids = resources.map(r => r.id);
  await db`
    DELETE FROM resources
    WHERE id = ANY(${ids})
  `;

  console.log(`\n✅ Deleted ${resources.length} government office entries`);

  await db.end();
}

cleanupGovernmentOffices().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

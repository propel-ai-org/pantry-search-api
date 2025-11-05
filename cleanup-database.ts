// ABOUTME: Database cleanup script to remove false positive entries
// ABOUTME: Applies name-based filtering to existing database records

import { initDatabase } from "./database";
import type { FoodResource } from "./database";

// Name patterns that indicate non-food-assistance locations
const BLOCKED_NAME_PATTERNS = [
  // Schools (unless name explicitly mentions food pantry/bank)
  /\b(elementary|middle|high|junior high|senior high)\s+school\b/i,
  /\b(university|college)\b/i,
  /\bschool\b(?!.*\b(food pantry|food bank|pantry)\b)/i,

  // Commercial businesses
  /\b(meal prep|restaurant|cafe|grocery|market|store)\b/i,

  // Government offices (unless explicitly food distribution)
  /\b(city hall|county office|dmv|department of)\b(?!.*\b(food|nutrition|wic)\b)/i,

  // National umbrella organizations (not actual distribution sites)
  /^feeding america$/i,
  /^feedingamerica$/i,
];

function shouldRemove(name: string): boolean {
  const trimmedName = name.trim();
  for (const pattern of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(trimmedName)) {
      return true;
    }
  }
  return false;
}

async function cleanupDatabase() {
  console.log("Starting database cleanup...\n");

  const db = await initDatabase();

  // Get all resources
  const resources = await db<FoodResource[]>`
    SELECT * FROM resources
    ORDER BY name
  `;

  console.log(`Total resources in database: ${resources.length}\n`);

  // Find resources to remove
  const toRemove: FoodResource[] = [];
  for (const resource of resources) {
    if (shouldRemove(resource.name)) {
      toRemove.push(resource);
    }
  }

  console.log(`Resources to remove: ${toRemove.length}\n`);

  if (toRemove.length > 0) {
    console.log("Resources that will be removed:");
    for (const resource of toRemove) {
      console.log(`  - ${resource.name} (ID: ${resource.id})`);
    }

    console.log("\nRemoving resources...");
    for (const resource of toRemove) {
      await db`
        DELETE FROM resources
        WHERE id = ${resource.id}
      `;
    }

    console.log(`\n✅ Removed ${toRemove.length} false positive entries`);
  } else {
    console.log("No false positives found - database is clean!");
  }

  const finalCount = await db<{ count: number }[]>`
    SELECT COUNT(*) as count FROM resources
  `;
  console.log(`\nFinal resource count: ${finalCount[0].count}`);

  await db.end();
}

cleanupDatabase().catch((error) => {
  console.error("Error during cleanup:", error);
  process.exit(1);
});

// ABOUTME: Removes all resources marked as permanently closed during enrichment
// ABOUTME: These are places that no longer exist and should not be in the dataset

import { initDatabase } from "../src/database";
import type { FoodResource } from "../src/database";

async function removePermanentlyClosed() {
  console.log("Starting removal of permanently closed resources...\n");

  const db = await initDatabase();

  // Get resources marked as permanently closed
  const closedResources = await db<FoodResource[]>`
    SELECT * FROM resources
    WHERE enrichment_failure_reason = 'Permanently closed'
    ORDER BY name
  `;

  console.log(`Found ${closedResources.length} permanently closed resources\n`);

  if (closedResources.length > 0) {
    console.log("Resources to be removed:");
    for (const resource of closedResources) {
      console.log(`  - ${resource.name} (ID: ${resource.id}, ${resource.city}, ${resource.state})`);
    }

    console.log("\nRemoving resources...");
    const result = await db`
      DELETE FROM resources
      WHERE enrichment_failure_reason = 'Permanently closed'
    `;

    console.log(`\n✅ Removed ${closedResources.length} permanently closed resources`);
  } else {
    console.log("No permanently closed resources found - database is clean!");
  }

  const finalCount = await db<{ count: number }[]>`
    SELECT COUNT(*) as count FROM resources
  `;
  console.log(`\nFinal resource count: ${finalCount[0].count}`);

  await db.end();
}

removePermanentlyClosed().catch((error) => {
  console.error("Error during removal:", error);
  process.exit(1);
});

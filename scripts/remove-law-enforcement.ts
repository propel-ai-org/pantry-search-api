// ABOUTME: Cleanup script to remove law enforcement facilities from resources
// ABOUTME: Removes sheriff offices, police departments, and other law enforcement entries

import { initDatabase } from "../src/core/database";

const LAW_ENFORCEMENT_PATTERNS = [
  /\bsheriff'?s?\s+(office|department|dept)\b/i,
  /\bpolice\s+(department|dept|station|office)\b/i,
  /\blaw\s+enforcement\b/i,
  /\bcorrections\s+(department|facility|office)\b/i,
  /\bjail\b/i,
  /\bdetention\s+center\b/i,
];

async function removeLawEnforcement() {
  console.log("Connecting to database...");
  const db = await initDatabase();

  try {
    // Get all resources
    const allResources = await db<Array<{ id: number; name: string; address: string; city: string; state: string }>>`
      SELECT id, name, address, city, state FROM resources
    `;

    console.log(`\nScanning ${allResources.length} resources for law enforcement facilities...`);

    const toDelete: number[] = [];
    const matches: Array<{ id: number; name: string; address: string }> = [];

    for (const resource of allResources) {
      const searchText = `${resource.name} ${resource.address}`.toLowerCase();

      for (const pattern of LAW_ENFORCEMENT_PATTERNS) {
        if (pattern.test(searchText)) {
          toDelete.push(resource.id);
          matches.push({
            id: resource.id,
            name: resource.name,
            address: `${resource.address}, ${resource.city}, ${resource.state}`,
          });
          break;
        }
      }
    }

    if (toDelete.length === 0) {
      console.log("\n✅ No law enforcement facilities found!");
      process.exit(0);
    }

    console.log(`\n⚠️  Found ${toDelete.length} law enforcement facilities:\n`);
    matches.forEach((match, i) => {
      console.log(`${i + 1}. [ID: ${match.id}] ${match.name}`);
      console.log(`   ${match.address}\n`);
    });

    // Confirm deletion
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(`\nDelete these ${toDelete.length} entries? (yes/no): `, resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "yes") {
      console.log("\n❌ Deletion cancelled.");
      process.exit(0);
    }

    // Delete resources
    console.log("\n🗑️  Deleting resources...");
    const result = await db`
      DELETE FROM resources
      WHERE id = ANY(${toDelete})
      RETURNING id
    `;

    console.log(`\n✅ Successfully deleted ${result.length} law enforcement facilities!`);

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
}

removeLawEnforcement();

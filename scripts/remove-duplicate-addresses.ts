// ABOUTME: Removes duplicate resources that share the same address
// ABOUTME: Keeps the entry with the most descriptive name (longest name)

import { initDatabase } from "../src/core/database";

async function removeDuplicateAddresses() {
  const db = await initDatabase();

  console.log("Finding duplicate addresses...");

  // Find all resources grouped by address
  const allResources = await db<Array<{ id: number; name: string; address: string }>>`
    SELECT id, name, address
    FROM resources
    WHERE address IS NOT NULL AND address != ''
    ORDER BY address, name
  `;

  // Group by normalized address
  const addressGroups = new Map<string, Array<{ id: number; name: string; address: string }>>();

  for (const resource of allResources) {
    const normalizedAddress = resource.address.toLowerCase().trim();
    if (!addressGroups.has(normalizedAddress)) {
      addressGroups.set(normalizedAddress, []);
    }
    addressGroups.get(normalizedAddress)!.push(resource);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(addressGroups.entries())
    .filter(([_, resources]) => resources.length > 1);

  console.log(`Found ${duplicateGroups.length} addresses with duplicates`);

  if (duplicateGroups.length === 0) {
    console.log("No duplicates to remove!");
    await db.end();
    return;
  }

  let totalRemoved = 0;

  for (const [address, resources] of duplicateGroups) {
    console.log(`\n${address} has ${resources.length} entries:`);
    resources.forEach(r => console.log(`  - ID ${r.id}: ${r.name}`));

    // Keep the one with the longest name (usually most descriptive)
    const sorted = resources.sort((a, b) => b.name.length - a.name.length);
    const toKeep = sorted[0];
    const toRemove = sorted.slice(1);

    console.log(`  Keeping ID ${toKeep.id}: ${toKeep.name}`);
    console.log(`  Removing ${toRemove.length} duplicate(s)`);

    // Remove the duplicates
    for (const resource of toRemove) {
      await db`DELETE FROM resources WHERE id = ${resource.id}`;
      totalRemoved++;
    }
  }

  console.log(`\n✅ Removed ${totalRemoved} duplicate resources`);
  await db.end();
}

removeDuplicateAddresses().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

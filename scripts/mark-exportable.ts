// ABOUTME: Script to mark pantry and bank type resources as exportable
// ABOUTME: Sets exportable=true for all resources with type 'pantry' or 'bank'

import { initDatabase } from "../src/core/database";

async function markExportable() {
  console.log("Connecting to database...");
  const db = await initDatabase();

  try {
    console.log("\nMarking all 'pantry' and 'bank' type resources as exportable...");

    const result = await db`
      UPDATE resources
      SET exportable = true
      WHERE type IN ('pantry', 'bank')
        AND exportable = false
      RETURNING id, name, type
    `;

    console.log(`\n✅ Marked ${result.length} resources as exportable!`);

    if (result.length > 0) {
      console.log("\nSample of updated resources:");
      result.slice(0, 10).forEach((r, i) => {
        console.log(`${i + 1}. [${r.type}] ${r.name}`);
      });

      if (result.length > 10) {
        console.log(`... and ${result.length - 10} more`);
      }
    }

    // Show summary stats
    const stats = await db`
      SELECT
        type,
        COUNT(*) as total,
        SUM(CASE WHEN exportable THEN 1 ELSE 0 END) as exportable_count
      FROM resources
      GROUP BY type
    `;

    console.log("\n📊 Current export status by type:");
    stats.forEach(s => {
      console.log(`  ${s.type}: ${s.exportable_count}/${s.total} exportable`);
    });

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
}

markExportable();

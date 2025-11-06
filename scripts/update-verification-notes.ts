// ABOUTME: Updates verification notes to new wording
// ABOUTME: Changes "Verified via Google Places API" to "Found via web search and verified via Google Places API"

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    console.log("Updating verification notes...");

    // Update all records that have the old verification notes format
    const result = await sql`
      UPDATE resources
      SET verification_notes = REPLACE(
        verification_notes,
        'Verified via Google Places API',
        'Found via web search and verified via Google Places API'
      )
      WHERE verification_notes LIKE 'Verified via Google Places API%'
    `;

    console.log(`✅ Updated ${result.count} records`);
  } catch (error) {
    console.error("❌ Update failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();

// ABOUTME: Migration script to add amenity columns to existing database
// ABOUTME: Adds wheelchair accessibility, service options, and editorial summary fields

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
    console.log("Adding amenity columns to resources table...");

    // Add each column with IF NOT EXISTS
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN
    `;
    console.log("✓ Added wheelchair_accessible column");

    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS has_curbside_pickup BOOLEAN
    `;
    console.log("✓ Added has_curbside_pickup column");

    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS has_delivery BOOLEAN
    `;
    console.log("✓ Added has_delivery column");

    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS has_takeout BOOLEAN
    `;
    console.log("✓ Added has_takeout column");

    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS editorial_summary TEXT
    `;
    console.log("✓ Added editorial_summary column");

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();

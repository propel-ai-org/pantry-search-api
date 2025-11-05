// ABOUTME: Database reset script to drop and recreate all tables
// ABOUTME: Clears all existing data and applies current schema

import postgres from "postgres";

async function resetDatabase() {
  console.log("Resetting database...\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const sql = postgres(databaseUrl, {
    ssl: { rejectUnauthorized: false },
    onnotice: () => {} // Suppress NOTICE messages
  });

  try {
    // Drop existing tables
    console.log("Dropping existing tables...");
    await sql`DROP TABLE IF EXISTS resources CASCADE`;
    await sql`DROP TABLE IF EXISTS zip_searches CASCADE`;
    await sql`DROP TABLE IF EXISTS county_searches CASCADE`;
    console.log("✅ Tables dropped\n");

    // Now call initDatabase to recreate with new schema
    console.log("Creating tables with new schema...");
    await sql.end();

    // Re-import and run initDatabase
    const { initDatabase } = await import("./database");
    const db = await initDatabase();
    console.log("✅ Tables created with new schema\n");

    console.log("Database reset complete!");
    await db.end();
  } catch (error) {
    console.error("Reset failed:", error);
    throw error;
  }
}

resetDatabase().catch((error) => {
  console.error("Error during reset:", error);
  process.exit(1);
});

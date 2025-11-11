// ABOUTME: Adds social media URL columns to the resources table
// ABOUTME: One-time migration script to add Facebook, Twitter, Instagram, YouTube fields

import { initDatabase } from "../src/core/database";

async function addSocialMediaColumns() {
  const db = await initDatabase();

  console.log("Adding social media columns to resources table...");

  try {
    // Add the new columns
    await db`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS url_facebook TEXT,
      ADD COLUMN IF NOT EXISTS url_twitter TEXT,
      ADD COLUMN IF NOT EXISTS url_instagram TEXT,
      ADD COLUMN IF NOT EXISTS url_youtube TEXT
    `;

    console.log("✅ Successfully added social media columns!");
  } catch (error) {
    console.error("Error adding columns:", error);
    throw error;
  } finally {
    await db.end();
  }
}

addSocialMediaColumns().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

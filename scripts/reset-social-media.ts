// ABOUTME: Resets social media columns to NULL for all resources
// ABOUTME: Allows re-running backfill with improved extraction logic

import { initDatabase } from "../src/core/database";

async function resetSocialMedia() {
  const db = await initDatabase();

  console.log("Resetting social media columns...");

  const result = await db`
    UPDATE resources
    SET url_facebook = NULL,
        url_twitter = NULL,
        url_instagram = NULL,
        url_youtube = NULL
    WHERE url_facebook IS NOT NULL
       OR url_twitter IS NOT NULL
       OR url_instagram IS NOT NULL
       OR url_youtube IS NOT NULL
  `;

  console.log(`✅ Reset ${result.count} resources`);

  await db.end();
}

resetSocialMedia().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

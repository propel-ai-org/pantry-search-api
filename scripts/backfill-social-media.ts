// ABOUTME: Backfills social media links for existing resources
// ABOUTME: Fetches websites and extracts social media URLs for resources that have websites but no social links

import { initDatabase } from "../src/core/database";
import { extractSocialMediaLinks } from "../src/utils/social-media-extractor";
import type { FoodResource } from "../src/core/database";

async function backfillSocialMedia() {
  const db = await initDatabase();

  console.log("Finding resources with websites but no social media links...");

  // Find resources that have a website but no social media links yet
  const resources = await db<FoodResource[]>`
    SELECT id, name, source_url, url_facebook, url_twitter, url_instagram, url_youtube
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
      AND (url_facebook IS NULL OR url_facebook = '')
      AND (url_twitter IS NULL OR url_twitter = '')
      AND (url_instagram IS NULL OR url_instagram = '')
      AND (url_youtube IS NULL OR url_youtube = '')
    ORDER BY id
    LIMIT 50
  `;

  console.log(`Found ${resources.length} resources to process`);

  if (resources.length === 0) {
    console.log("No resources need social media backfill!");
    await db.end();
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const resource of resources) {
    console.log(`\nProcessing: ${resource.name}`);
    console.log(`  Website: ${resource.source_url}`);

    try {
      const socialLinks = await extractSocialMediaLinks(resource.source_url!, resource.name);

      const foundAny = socialLinks.facebook || socialLinks.twitter || socialLinks.instagram || socialLinks.youtube;

      if (foundAny) {
        await db`
          UPDATE resources
          SET
            url_facebook = ${socialLinks.facebook || null},
            url_twitter = ${socialLinks.twitter || null},
            url_instagram = ${socialLinks.instagram || null},
            url_youtube = ${socialLinks.youtube || null}
          WHERE id = ${resource.id}
        `;

        const links = [];
        if (socialLinks.facebook) links.push("Facebook");
        if (socialLinks.twitter) links.push("Twitter");
        if (socialLinks.instagram) links.push("Instagram");
        if (socialLinks.youtube) links.push("YouTube");

        console.log(`  ✅ Updated with: ${links.join(", ")}`);
        updated++;
      } else {
        console.log(`  ⚠️  No social media links found`);
        skipped++;
      }

      // Small delay to be respectful to websites
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated} resources`);
  console.log(`   Skipped: ${skipped} resources`);

  await db.end();
}

backfillSocialMedia().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

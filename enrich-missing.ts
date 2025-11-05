// ABOUTME: Enrichment script for resources missing lat/long data
// ABOUTME: Runs Google Places API enrichment on resources that need it

import { initDatabase } from "./database";
import type { FoodResource } from "./database";
import { enrichWithGooglePlaces } from "./google-places";

async function enrichMissingData() {
  console.log("Starting enrichment of resources with missing data...\n");

  const db = await initDatabase();

  // Find resources that need enrichment
  const needsEnrichment = await db<FoodResource[]>`
    SELECT * FROM resources
    WHERE needs_enrichment = true
    ORDER BY created_at DESC
  `;

  console.log(`Found ${needsEnrichment.length} resources needing enrichment\n`);

  let enriched = 0;
  let failed = 0;

  for (const resource of needsEnrichment) {
    console.log(`[${enriched + failed + 1}/${needsEnrichment.length}] Enriching: ${resource.name}`);

    const enrichedData = await enrichWithGooglePlaces(resource);

    if (enrichedData && enrichedData.latitude && enrichedData.longitude) {
      // Update the resource with enriched data
      await db`
        UPDATE resources
        SET
          latitude = ${enrichedData.latitude},
          longitude = ${enrichedData.longitude},
          address = ${enrichedData.address},
          city = ${enrichedData.city || resource.city},
          state = ${enrichedData.state || resource.state},
          zip_code = ${enrichedData.zip_code || resource.zip_code},
          phone = ${enrichedData.phone || resource.phone},
          hours = ${enrichedData.hours || resource.hours},
          rating = ${enrichedData.rating || resource.rating},
          source_url = ${enrichedData.source_url || resource.source_url},
          verification_notes = ${enrichedData.verification_notes},
          google_place_id = ${enrichedData.google_place_id},
          needs_enrichment = false,
          last_enrichment_attempt = CURRENT_TIMESTAMP,
          last_verified_at = CURRENT_TIMESTAMP
        WHERE id = ${resource.id}
      `;

      enriched++;
      console.log(`  ✅ Successfully enriched`);
    } else {
      // Mark as attempted even if failed
      await db`
        UPDATE resources
        SET
          last_enrichment_attempt = CURRENT_TIMESTAMP
        WHERE id = ${resource.id}
      `;

      failed++;
      console.log(`  ❌ Failed to enrich`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log(`\n📊 Enrichment complete:`);
  console.log(`  ✅ Enriched: ${enriched}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📍 Total: ${needsEnrichment.length}`);

  await db.end();
}

enrichMissingData().catch((error) => {
  console.error("Error during enrichment:", error);
  process.exit(1);
});

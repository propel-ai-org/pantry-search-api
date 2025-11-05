// ABOUTME: Background worker that enriches food resources with Google Places data
// ABOUTME: Continuously polls database for resources needing enrichment

import type { Database } from "bun:sql";
import type { FoodResource } from "./database";
import { enrichWithGooglePlaces } from "./google-places";

let isEnriching = false;
let shouldStop = false;

async function enrichmentLoop(db: Database) {
  while (!shouldStop) {
    try {
      if (!isEnriching) {
        isEnriching = true;

        // Find resources that need enrichment (but not permanently failed ones)
        const needsEnrichment = await db<FoodResource[]>`
          SELECT * FROM resources
          WHERE needs_enrichment = true
          AND (enrichment_failure_count < 3 OR enrichment_failure_count IS NULL)
          AND (enrichment_failure_reason IS NULL OR enrichment_failure_reason NOT LIKE '%Permanently closed%')
          ORDER BY created_at DESC
          LIMIT 10
        `;

        if (needsEnrichment.length > 0) {
          console.log(`[Enrichment] Processing ${needsEnrichment.length} resources...`);

          for (const resource of needsEnrichment) {
            const result = await enrichWithGooglePlaces(resource);

            if (result.data && result.data.latitude && result.data.longitude) {
              // Update the resource with enriched data
              await db`
                UPDATE resources
                SET
                  latitude = ${result.data.latitude},
                  longitude = ${result.data.longitude},
                  address = ${result.data.address},
                  city = ${result.data.city || resource.city},
                  state = ${result.data.state || resource.state},
                  zip_code = ${result.data.zip_code || resource.zip_code},
                  phone = ${result.data.phone || resource.phone},
                  hours = ${result.data.hours || resource.hours},
                  rating = ${result.data.rating || resource.rating},
                  source_url = ${result.data.source_url || resource.source_url},
                  wheelchair_accessible = ${result.data.wheelchair_accessible ?? null},
                  has_curbside_pickup = ${result.data.has_curbside_pickup ?? null},
                  has_delivery = ${result.data.has_delivery ?? null},
                  has_takeout = ${result.data.has_takeout ?? null},
                  editorial_summary = ${result.data.editorial_summary ?? null},
                  verification_notes = ${result.data.verification_notes},
                  google_place_id = ${result.data.google_place_id},
                  needs_enrichment = false,
                  last_enrichment_attempt = CURRENT_TIMESTAMP,
                  last_verified_at = CURRENT_TIMESTAMP,
                  enrichment_failure_count = 0,
                  enrichment_failure_reason = NULL
                WHERE id = ${resource.id}
              `;
              console.log(`[Enrichment] ✅ ${resource.name}`);
            } else {
              // Mark as failed with reason
              const failureCount = (resource.enrichment_failure_count || 0) + 1;
              await db`
                UPDATE resources
                SET
                  last_enrichment_attempt = CURRENT_TIMESTAMP,
                  enrichment_failure_count = ${failureCount},
                  enrichment_failure_reason = ${result.failureReason || "Unknown error"}
                WHERE id = ${resource.id}
              `;
              console.log(`[Enrichment] ❌ ${resource.name} (${result.failureReason})`);
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }

        isEnriching = false;
      }
    } catch (error) {
      console.error("[Enrichment] Error:", error);
      isEnriching = false;
    }

    // Wait 5 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export function startEnrichmentWorker(db: Database): () => void {
  shouldStop = false;
  enrichmentLoop(db).catch((error) => {
    console.error("[Enrichment] Fatal error:", error);
  });

  return () => {
    shouldStop = true;
  };
}

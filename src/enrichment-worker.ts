// ABOUTME: Background worker that enriches food resources with Google Places data
// ABOUTME: Continuously polls database for resources needing enrichment

import type { Database } from "bun:sql";
import type { FoodResource } from "./database";
import { enrichWithGooglePlaces, type EnrichmentResult } from "./google-places";

const MAX_CONCURRENT_ENRICHMENTS = 5;
let activeEnrichments = 0;
let shouldStop = false;

type EnrichmentFunction = (resource: FoodResource) => Promise<EnrichmentResult>;

async function processResource(
  db: Database,
  resource: FoodResource,
  enrichFn: EnrichmentFunction
): Promise<void> {
  try {
    const result = await enrichFn(resource);

    if (result.data && result.data.latitude && result.data.longitude) {
      // Update the resource with enriched data
      await db`
        UPDATE resources
        SET
          name = ${result.data.name || resource.name},
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
      console.log(`[Enrichment] ✅ ${result.data.name || resource.name}`);
    } else {
      // Check if permanently closed - mark as unexportable
      if (result.failureReason === 'Permanently closed') {
        await db`
          UPDATE resources
          SET
            exportable = false,
            last_enrichment_attempt = CURRENT_TIMESTAMP,
            enrichment_failure_count = ${(resource.enrichment_failure_count || 0) + 1},
            enrichment_failure_reason = ${result.failureReason}
          WHERE id = ${resource.id}
        `;
        console.log(`[Enrichment] ⛔ ${resource.name} (${result.failureReason} - marked unexportable)`);
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
    }
  } finally {
    activeEnrichments--;
  }
}

async function enrichmentLoop(db: Database, enrichFn: EnrichmentFunction) {
  while (!shouldStop) {
    try {
      // Only fetch new resources if we have capacity
      if (activeEnrichments < MAX_CONCURRENT_ENRICHMENTS) {
        const availableSlots = MAX_CONCURRENT_ENRICHMENTS - activeEnrichments;

        // Find resources that need enrichment (but not permanently failed ones)
        // Exclude resources attempted in the last 5 minutes to prevent race conditions
        const needsEnrichment = await db<FoodResource[]>`
          SELECT * FROM resources
          WHERE needs_enrichment = true
          AND (enrichment_failure_count < 3 OR enrichment_failure_count IS NULL)
          AND (enrichment_failure_reason IS NULL OR enrichment_failure_reason NOT LIKE '%Permanently closed%')
          AND (last_enrichment_attempt IS NULL OR last_enrichment_attempt < NOW() - INTERVAL '5 minutes')
          ORDER BY created_at DESC
          LIMIT ${availableSlots}
        `;

        if (needsEnrichment.length > 0) {
          // Immediately mark these resources as being enriched to prevent other threads from picking them up
          const resourceIds = needsEnrichment.map(r => r.id);
          await db`
            UPDATE resources
            SET last_enrichment_attempt = CURRENT_TIMESTAMP
            WHERE id = ANY(${resourceIds})
          `;

          console.log(`[Enrichment] Starting ${needsEnrichment.length} enrichment requests (${activeEnrichments} already running, max ${MAX_CONCURRENT_ENRICHMENTS})...`);

          // Start enrichment for each resource (fire and forget)
          for (const resource of needsEnrichment) {
            activeEnrichments++;
            processResource(db, resource, enrichFn).catch((error) => {
              console.error(`[Enrichment] Error processing ${resource.name}:`, error);
              activeEnrichments--;
            });

            // Small delay between starting requests to avoid overwhelming the API
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    } catch (error) {
      console.error("[Enrichment] Error in main loop:", error);
    }

    // Check every second for new work
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export function startEnrichmentWorker(
  db: Database,
  enrichFn?: EnrichmentFunction
): () => void {
  shouldStop = false;
  const fn = enrichFn || enrichWithGooglePlaces;
  enrichmentLoop(db, fn).catch((error) => {
    console.error("[Enrichment] Fatal error:", error);
  });

  return () => {
    shouldStop = true;
  };
}

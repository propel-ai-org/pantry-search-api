// ABOUTME: Main API server for food pantry/bank search
// ABOUTME: Provides endpoints to search and runs background enrichment

import { initDatabase } from "./database";
import type { FoodResource } from "./database";
import { searchFoodResources } from "./search";
import { searchFoodResourcesByCounty } from "./county-search";
import { findCounty } from "./counties";
import { enrichWithGooglePlaces } from "./google-places";

const db = await initDatabase();

// Background enrichment loop
let isEnriching = false;

async function enrichmentLoop() {
  while (true) {
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

// Start enrichment loop
enrichmentLoop().catch((error) => {
  console.error("[Enrichment] Fatal error:", error);
});

const server = Bun.serve({
  port: process.env.PORT || 3000,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/search" && req.method === "GET") {
      const zipCode = url.searchParams.get("zip");

      if (!zipCode) {
        return new Response(
          JSON.stringify({ error: "zip parameter is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Validate zip code format (5 digits)
      if (!/^\d{5}$/.test(zipCode)) {
        return new Response(
          JSON.stringify({ error: "zip must be a 5-digit number" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const results = await searchFoodResources(db, zipCode);

        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Search error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to search for food resources",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/search-county" && req.method === "GET") {
      const countyName = url.searchParams.get("county");
      const state = url.searchParams.get("state");

      if (!countyName || !state) {
        return new Response(
          JSON.stringify({
            error: "county and state parameters are required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const county = await findCounty(countyName, state);

        if (!county) {
          return new Response(
            JSON.stringify({
              error: `County not found: ${countyName}, ${state}`,
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const results = await searchFoodResourcesByCounty(db, county);

        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("County search error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to search for food resources by county",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

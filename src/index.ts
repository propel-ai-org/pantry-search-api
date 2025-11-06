// ABOUTME: Main API server for food pantry/bank search
// ABOUTME: Provides endpoints to search and runs background enrichment

import { initDatabase, type FoodResource } from "./database";
import { searchFoodResources } from "./search";
import { searchFoodResourcesByCounty } from "./county-search";
import { findCounty } from "./counties";
import { startEnrichmentWorker } from "./enrichment-worker";
import {
  getCountyStats,
  getEnrichmentStats,
  getUnprocessedCounties,
  getStateCountyStats,
} from "./monitoring";
import { generateStatusPage } from "./status-page";
import { analyzeResources, filterBySuspicion, groupByCategory } from "./false-positive-detector";
import { validateBatch } from "./ai-validator";
import { enrichWithGooglePlaces } from "./google-places";
import { generateAnalyzePage } from "./analyze-page";
import { expandDirectory } from "./directory-expander";

const db = await initDatabase();

// Start background enrichment worker
startEnrichmentWorker(db);

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

    if (url.pathname === "/status/counties" && req.method === "GET") {
      try {
        const html = await generateStatusPage(db);
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (error) {
        console.error("County stats error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to get county stats",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname.startsWith("/status/counties/") && req.method === "GET") {
      const state = url.pathname.split("/")[3];
      if (!state) {
        return new Response(JSON.stringify({ error: "State code required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const stats = await getStateCountyStats(db, state);
        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("State county stats error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to get state county stats",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/status/enrichment" && req.method === "GET") {
      try {
        const stats = await getEnrichmentStats(db);
        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Enrichment stats error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to get enrichment stats",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/status/unprocessed" && req.method === "GET") {
      const state = url.searchParams.get("state") || undefined;

      try {
        const unprocessed = await getUnprocessedCounties(db, state);
        return new Response(JSON.stringify({ unprocessed }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Unprocessed counties error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to get unprocessed counties",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/analyze-resources" && req.method === "GET") {
      const state = url.searchParams.get("state") || undefined;
      const type = url.searchParams.get("type") as "pantry" | "bank" | "mixed" | undefined;
      const minSuspicion = url.searchParams.get("min_suspicion")
        ? parseInt(url.searchParams.get("min_suspicion")!)
        : 50;
      const category = url.searchParams.get("category") || undefined;
      const limit = url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : 100;

      try {
        // Get resources with optional filters
        let resources: FoodResource[];

        if (state && type) {
          resources = await db<FoodResource[]>`
            SELECT * FROM resources
            WHERE state = ${state.toUpperCase()} AND type = ${type}
            ORDER BY created_at DESC
          `;
        } else if (state) {
          resources = await db<FoodResource[]>`
            SELECT * FROM resources
            WHERE state = ${state.toUpperCase()}
            ORDER BY created_at DESC
          `;
        } else if (type) {
          resources = await db<FoodResource[]>`
            SELECT * FROM resources
            WHERE type = ${type}
            ORDER BY created_at DESC
          `;
        } else {
          resources = await db<FoodResource[]>`
            SELECT * FROM resources
            ORDER BY created_at DESC
          `;
        }

        // Analyze for false positives
        const analyzed = analyzeResources(resources);

        // Filter by suspicion score
        let filtered = filterBySuspicion(analyzed, minSuspicion);

        // Filter by category if specified
        if (category) {
          filtered = filtered.filter(r => r.suspicion.category === category);
        }

        // Limit results
        filtered = filtered.slice(0, limit);

        // Group by category for summary
        const grouped = groupByCategory(filtered);
        const summary = Object.entries(grouped).map(([cat, items]) => ({
          category: cat,
          count: items.length,
          avg_suspicion: items.reduce((sum, item) => sum + item.suspicion.score, 0) / items.length,
        }));

        return new Response(JSON.stringify({
          summary,
          total_analyzed: resources.length,
          suspicious_count: filtered.length,
          resources: filtered,
        }, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Analysis error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to analyze resources",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/analyze-ui" && req.method === "GET") {
      try {
        const html = await generateAnalyzePage(db);
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (error) {
        console.error("Analyze UI error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to generate analyze UI",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/expand-directory" && req.method === "POST") {
      try {
        const body = await req.json() as { resource_ids?: number[] };
        const resourceIds = body.resource_ids;

        if (!resourceIds || !Array.isArray(resourceIds)) {
          return new Response(
            JSON.stringify({ error: "resource_ids array is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Get resources to expand
        const resources = await db<FoodResource[]>`
          SELECT * FROM resources
          WHERE id = ANY(${resourceIds})
        `;

        const expanded = [];
        const failed = [];
        const allNewResources: Partial<FoodResource>[] = [];

        for (const resource of resources) {
          const result = await expandDirectory(resource);

          if (result.success && result.new_resources.length > 0) {
            // Store new resources
            for (const newResource of result.new_resources) {
              const inserted = await db<{ id: number }[]>`
                INSERT INTO resources (
                  name, address, city, state, zip_code, county_name, county_geoid, location_type,
                  latitude, longitude, type, phone, hours, notes, is_verified, verification_notes,
                  source_url, needs_enrichment
                ) VALUES (
                  ${newResource.name || ""},
                  ${newResource.address || ""},
                  ${newResource.city || null},
                  ${newResource.state || null},
                  ${newResource.zip_code || null},
                  ${newResource.county_name || null},
                  ${newResource.county_geoid || null},
                  ${newResource.location_type || "county"},
                  ${newResource.latitude || null},
                  ${newResource.longitude || null},
                  ${newResource.type || "mixed"},
                  ${newResource.phone || null},
                  ${newResource.hours || null},
                  ${newResource.notes || null},
                  ${newResource.is_verified || false},
                  ${newResource.verification_notes || null},
                  ${newResource.source_url || null},
                  ${true}
                )
                RETURNING id
              `;

              if (inserted.length > 0) {
                allNewResources.push({ ...newResource, id: inserted[0].id });
              }
            }

            // Delete original directory entry
            await db`DELETE FROM resources WHERE id = ${resource.id}`;

            expanded.push({
              id: resource.id,
              name: resource.name,
              count: result.new_resources.length,
            });
          } else {
            failed.push({
              id: resource.id,
              name: resource.name,
              reason: result.error || "Unknown error",
            });
          }
        }

        return new Response(JSON.stringify({
          expanded_count: expanded.length,
          new_resources: allNewResources,
          failed: failed,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Expand directory error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to expand directory",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/update-url" && req.method === "POST") {
      try {
        const body = await req.json() as { resource_id?: number; source_url?: string };
        const { resource_id, source_url } = body;

        if (!resource_id || source_url === undefined) {
          return new Response(
            JSON.stringify({ error: "resource_id and source_url are required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Update the resource
        await db`
          UPDATE resources
          SET source_url = ${source_url}
          WHERE id = ${resource_id}
        `;

        return new Response(JSON.stringify({
          success: true,
          resource_id,
          source_url,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Update URL error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to update URL",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/bulk-actions" && req.method === "POST") {
      try {
        const body = await req.json() as { action?: string; resource_ids?: number[] };
        const action = body.action as "delete" | "validate" | "re-enrich";
        const resourceIds = body.resource_ids as number[];

        if (!action || !resourceIds || !Array.isArray(resourceIds)) {
          return new Response(
            JSON.stringify({ error: "action and resource_ids are required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        if (action === "delete") {
          // Delete resources
          const result = await db`
            DELETE FROM resources
            WHERE id = ANY(${resourceIds})
            RETURNING id
          `;

          return new Response(JSON.stringify({
            action: "delete",
            deleted_count: result.length,
            deleted_ids: result.map(r => r.id),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (action === "validate") {
          // Get resources to validate
          const resources = await db<FoodResource[]>`
            SELECT * FROM resources
            WHERE id = ANY(${resourceIds})
          `;

          // Run AI validation
          const validations = await validateBatch(resources, (completed, total) => {
            console.log(`AI validation progress: ${completed}/${total}`);
          });

          // Update resources with validation results
          const updates = [];
          for (const [id, validation] of validations.entries()) {
            updates.push({
              id,
              validation,
            });

            // Update verification status based on validation
            const notes = `AI validation: ${validation.reasoning} (confidence: ${validation.confidence}%)`;
            await db`
              UPDATE resources SET
                is_verified = ${validation.is_food_resource},
                verification_notes = ${notes}
              WHERE id = ${id}
            `;
          }

          return new Response(JSON.stringify({
            action: "validate",
            validated_count: updates.length,
            results: updates,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (action === "re-enrich") {
          // Get resources to re-enrich
          const resources = await db<FoodResource[]>`
            SELECT * FROM resources
            WHERE id = ANY(${resourceIds})
          `;

          const enriched = [];
          const failed = [];

          for (const resource of resources) {
            try {
              const enrichmentResult = await enrichWithGooglePlaces(resource);

              if (enrichmentResult.data) {
                const enrichedData = enrichmentResult.data;
                // Update resource with enriched data
                await db`
                  UPDATE resources SET
                    phone = ${enrichedData.phone || resource.phone},
                    hours = ${enrichedData.hours || resource.hours},
                    rating = ${enrichedData.rating || resource.rating},
                    latitude = ${enrichedData.latitude || resource.latitude},
                    longitude = ${enrichedData.longitude || resource.longitude},
                    google_place_id = ${enrichedData.google_place_id || resource.google_place_id},
                    editorial_summary = ${enrichedData.editorial_summary || resource.editorial_summary},
                    wheelchair_accessible = ${enrichedData.wheelchair_accessible ?? resource.wheelchair_accessible},
                    has_curbside_pickup = ${enrichedData.has_curbside_pickup ?? resource.has_curbside_pickup},
                    has_delivery = ${enrichedData.has_delivery ?? resource.has_delivery},
                    has_takeout = ${enrichedData.has_takeout ?? resource.has_takeout},
                    url_facebook = ${enrichedData.url_facebook || resource.url_facebook},
                    url_twitter = ${enrichedData.url_twitter || resource.url_twitter},
                    url_instagram = ${enrichedData.url_instagram || resource.url_instagram},
                    url_youtube = ${enrichedData.url_youtube || resource.url_youtube},
                    needs_enrichment = false,
                    enrichment_failure_count = 0,
                    enrichment_failure_reason = null,
                    last_enrichment_attempt = NOW()
                  WHERE id = ${resource.id}
                `;
                enriched.push(resource.id);
              } else {
                failed.push({
                  id: resource.id,
                  reason: enrichmentResult.failureReason || "No enrichment data found"
                });
              }
            } catch (error) {
              failed.push({
                id: resource.id,
                reason: error instanceof Error ? error.message : String(error)
              });
            }

            // Rate limiting
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          return new Response(JSON.stringify({
            action: "re-enrich",
            enriched_count: enriched.length,
            enriched_ids: enriched,
            failed_count: failed.length,
            failed: failed,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ error: "Invalid action. Must be delete, validate, or re-enrich" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        console.error("Bulk action error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to perform bulk action",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (url.pathname === "/export" && req.method === "GET") {
      const state = url.searchParams.get("state") || undefined;
      const limit = url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : undefined;

      try {
        // Get all resources (or filtered by state), excluding "mixed" type
        const resources = await db<FoodResource[]>`
          SELECT * FROM resources
          WHERE type IN ('pantry', 'bank')
          ${state ? db`AND state = ${state.toUpperCase()}` : db``}
          ORDER BY created_at DESC
          ${limit ? db`LIMIT ${limit}` : db``}
        `;

        // Transform to app format
        const exportData = resources.map(resource => {
          // Map type to store_type format
          let storeType = "Food Pantry";
          if (resource.type === "bank") storeType = "Food Bank";
          else if (resource.type === "mixed") storeType = "Food Pantry";

          // Build description from available fields
          const descParts = [];
          if (resource.hours) descParts.push(`Hours: ${resource.hours}`);
          if (resource.eligibility_requirements) descParts.push(resource.eligibility_requirements);
          if (resource.services_offered) descParts.push(`Services: ${resource.services_offered}`);
          if (resource.notes) descParts.push(resource.notes);

          return {
            source: "county-search",
            source_url: resource.source_url || "",
            source_record_id: resource.id?.toString() || "",
            source_objectid: resource.google_place_id || "",
            store_name: resource.name,
            store_street_address: resource.address,
            additional_address: "",
            city: resource.city || "",
            state: resource.state || "",
            zip4: "",
            county: resource.county_name || "",
            store_type: storeType,
            latitude: resource.latitude?.toString() || "",
            longitude: resource.longitude?.toString() || "",
            incentive_program: "",
            grantee_name: "",
            first_scraped_at: resource.created_at || new Date().toISOString(),
            last_scraped_at: resource.last_verified_at || resource.created_at || new Date().toISOString(),
            address: resource.address,
            zip5: resource.zip_code || "",
            phone: resource.phone || "",
            description: descParts.join(". "),
            url: resource.source_url || "",
            url_facebook: resource.url_facebook || "",
            url_instagram: resource.url_instagram || "",
            url_twitter: resource.url_twitter || "",
            url_youtube: resource.url_youtube || "",
          };
        });

        return new Response(JSON.stringify(exportData, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Export error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to export resources",
            details: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

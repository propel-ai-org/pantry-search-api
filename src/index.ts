// ABOUTME: Main API server for food pantry/bank search
// ABOUTME: Provides endpoints to search and runs background enrichment

import { initDatabase } from "./database";
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

    if (url.pathname === "/export" && req.method === "GET") {
      const state = url.searchParams.get("state") || undefined;
      const limit = url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : undefined;

      try {
        // Get all resources (or filtered by state)
        const resources = await db<FoodResource[]>`
          SELECT * FROM resources
          ${state ? db`WHERE state = ${state.toUpperCase()}` : db``}
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

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

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

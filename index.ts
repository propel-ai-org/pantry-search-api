// ABOUTME: Main API server for food pantry/bank search
// ABOUTME: Provides endpoint to search for food resources by zip code

import { initDatabase } from "./database";
import { searchFoodResources } from "./search";

const db = initDatabase();

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

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

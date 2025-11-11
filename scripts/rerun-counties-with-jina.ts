// ABOUTME: Re-runs existing counties with Jina search to find additional resources
// ABOUTME: Processes counties in parallel with configurable concurrency

import { initDatabase } from "../src/core/database";
import { searchWithJina } from "../src/search/jina-search";

const CONCURRENCY = 3; // Number of counties to process in parallel

interface County {
  county_geoid: string;
  county_name: string;
  state: string;
  result_count: number;
  searched_at: string;
}

async function rerunCountiesWithJina(limit?: number) {
  const db = await initDatabase();

  console.log("Fetching counties that have been searched...");

  // Get all counties that have been searched, ordered by result count (prioritize low results)
  const rawCounties = await db<County[]>`
    SELECT county_geoid, county_name, state, result_count, searched_at
    FROM county_searches
    ORDER BY result_count ASC, searched_at ASC
    ${limit ? db`LIMIT ${limit}` : db``}
  `;

  // Map to expected format
  const counties = rawCounties.map(c => ({
    geoid: c.county_geoid,
    name: c.county_name,
    state: c.state,
    result_count: c.result_count,
    searched_at: c.searched_at
  }));

  console.log(`Found ${counties.length} counties to process`);

  if (counties.length === 0) {
    console.log("No counties to process!");
    await db.end();
    return;
  }

  let processed = 0;
  let totalAdded = 0;
  let errors = 0;

  // Process counties in batches
  for (let i = 0; i < counties.length; i += CONCURRENCY) {
    const batch = counties.slice(i, i + CONCURRENCY);
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(counties.length / CONCURRENCY)}`);
    console.log(`Counties: ${batch.map(c => `${c.name}, ${c.state}`).join("; ")}`);
    console.log("=".repeat(80));

    const batchPromises = batch.map(async (county) => {
      try {
        console.log(`\n[${county.name}, ${county.state}] Starting Jina search...`);

        // Use Jina to search for resources
        const query = `${county.name} County, ${county.state}`;
        const jinaResults = await searchWithJina(query, "county");

        console.log(`[${county.name}, ${county.state}] Found ${jinaResults.length} resources from Jina`);

        // Check for existing resources to avoid duplicates
        const existingResources = await db<Array<{ id: number; address: string }>>`
          SELECT id, address FROM resources
        `;

        const existingAddresses = new Set(
          existingResources.map(r => r.address?.toLowerCase().trim().replace(/\s+/g, ' ')).filter(Boolean)
        );

        // Deduplicate Jina results by address
        const seenAddressesInResults = new Map<string, typeof jinaResults[0]>();
        for (const resource of jinaResults) {
          const normalizedAddress = resource.address?.toLowerCase().trim().replace(/\s+/g, ' ');
          if (normalizedAddress && !seenAddressesInResults.has(normalizedAddress)) {
            seenAddressesInResults.set(normalizedAddress, resource);
          }
        }

        const dedupedJinaResults = Array.from(seenAddressesInResults.values());

        // Store new results in database
        let insertedCount = 0;
        for (const resource of dedupedJinaResults) {
          try {
            const normalizedAddress = resource.address?.toLowerCase().trim().replace(/\s+/g, ' ');

            // Skip if we already have this address
            if (normalizedAddress && existingAddresses.has(normalizedAddress)) {
              continue;
            }

            await db`
              INSERT INTO resources (
                name, address, city, state, zip_code, county_name, county_geoid, location_type,
                latitude, longitude, type, phone, hours, rating, wait_time_minutes,
                eligibility_requirements, services_offered, languages_spoken, accessibility_notes,
                notes, is_verified, verification_notes, source_url, needs_enrichment
              ) VALUES (
                ${resource.name || ""},
                ${resource.address || ""},
                ${resource.city || null},
                ${resource.state || county.state},
                ${resource.zip_code || null},
                ${county.name},
                ${county.geoid},
                'county',
                ${resource.latitude || null},
                ${resource.longitude || null},
                ${resource.type || "mixed"},
                ${resource.phone || null},
                ${resource.hours || null},
                ${resource.rating || null},
                ${resource.wait_time_minutes || null},
                ${resource.eligibility_requirements || null},
                ${resource.services_offered || null},
                ${resource.languages_spoken || null},
                ${resource.accessibility_notes || null},
                ${resource.notes || null},
                ${resource.is_verified !== undefined ? resource.is_verified : true},
                ${resource.verification_notes || "Found via Jina search (re-run)"},
                ${resource.source_url || null},
                ${true}
              )
            `;

            if (normalizedAddress) {
              existingAddresses.add(normalizedAddress);
            }
            insertedCount++;
          } catch (error) {
            console.error(`[${county.name}, ${county.state}] Error inserting resource ${resource.name}:`, error);
          }
        }

        // Update county_searches table with new result count
        const newResultCount = county.result_count + insertedCount;
        await db`
          UPDATE county_searches
          SET result_count = ${newResultCount},
              searched_at = NOW()
          WHERE county_geoid = ${county.geoid}
        `;

        console.log(`[${county.name}, ${county.state}] ✅ Added ${insertedCount} new resources (${county.result_count} → ${newResultCount})`);

        return { success: true, added: insertedCount };
      } catch (error) {
        console.error(`[${county.name}, ${county.state}] ❌ Error:`, error);
        return { success: false, added: 0 };
      }
    });

    const results = await Promise.all(batchPromises);

    // Update stats
    results.forEach(result => {
      processed++;
      if (result.success) {
        totalAdded += result.added;
      } else {
        errors++;
      }
    });

    console.log(`\nBatch complete: ${processed}/${counties.length} counties processed`);
    console.log(`Total new resources added: ${totalAdded}`);
    if (errors > 0) {
      console.log(`Errors: ${errors}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ All counties processed!");
  console.log(`Processed: ${processed} counties`);
  console.log(`Added: ${totalAdded} new resources`);
  console.log(`Errors: ${errors}`);
  console.log("=".repeat(80));

  await db.end();
}

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

if (limit) {
  console.log(`Running with limit: ${limit} counties\n`);
}

rerunCountiesWithJina(limit).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

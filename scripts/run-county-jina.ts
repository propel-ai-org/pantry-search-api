// ABOUTME: Run Jina search on a specific county
// ABOUTME: Usage: bun scripts/run-county-jina.ts "County Name" "State"

import { initDatabase } from "../src/core/database";
import { searchWithJina } from "../src/search/jina-search";
import { findCounty } from "../src/core/counties";

async function runCountyJina(countyName: string, state: string) {
  const db = await initDatabase();

  console.log(`Searching for ${countyName}, ${state}...`);

  const county = await findCounty(countyName, state);

  if (!county) {
    console.error(`County not found: ${countyName}, ${state}`);
    process.exit(1);
  }

  console.log(`Found county: ${county.name} (GEOID: ${county.geoid})`);
  console.log("\nStarting Jina search...\n");

  try {
    // Use Jina to search for resources
    const query = `${county.name} County, ${county.state}`;
    const jinaResults = await searchWithJina(query, "county");

    console.log(`\nJina search found ${jinaResults.length} resources`);

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
      } else if (normalizedAddress) {
        console.log(`Skipping duplicate from Jina: ${resource.name} at ${resource.address}`);
      }
    }

    const dedupedJinaResults = Array.from(seenAddressesInResults.values());
    console.log(`After deduplication: ${dedupedJinaResults.length} unique addresses`);

    // Store results in database
    let insertedCount = 0;
    for (const resource of dedupedJinaResults) {
      try {
        const normalizedAddress = resource.address?.toLowerCase().trim().replace(/\s+/g, ' ');

        // Skip if we already have this address
        if (normalizedAddress && existingAddresses.has(normalizedAddress)) {
          console.log(`Skipping existing: ${resource.name} at ${resource.address}`);
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
            ${resource.verification_notes || "Found via Jina search"},
            ${resource.source_url || null},
            ${true}
          )
        `;

        console.log(`✅ Added: ${resource.name}`);

        if (normalizedAddress) {
          existingAddresses.add(normalizedAddress);
        }
        insertedCount++;
      } catch (error) {
        console.error(`Error inserting resource ${resource.name}:`, error);
      }
    }

    // Update county_searches table
    const existingSearch = await db<Array<{ id: number; result_count: number }>>`
      SELECT id, result_count FROM county_searches
      WHERE county_geoid = ${county.geoid}
    `;

    if (existingSearch.length > 0) {
      const newResultCount = existingSearch[0].result_count + insertedCount;
      await db`
        UPDATE county_searches
        SET result_count = ${newResultCount},
            searched_at = NOW()
        WHERE county_geoid = ${county.geoid}
      `;
      console.log(`\nUpdated county record: ${existingSearch[0].result_count} → ${newResultCount} resources`);
    } else {
      await db`
        INSERT INTO county_searches (county_geoid, county_name, state, result_count, searched_at)
        VALUES (${county.geoid}, ${county.name}, ${county.state}, ${insertedCount}, NOW())
      `;
      console.log(`\nCreated county record with ${insertedCount} resources`);
    }

    console.log(`\n✅ Success! Added ${insertedCount} new resources to ${county.name}, ${county.state}`);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: bun scripts/run-county-jina.ts "County Name" "State"');
  console.error('Example: bun scripts/run-county-jina.ts "San Francisco" "CA"');
  process.exit(1);
}

const [countyName, state] = args;
runCountyJina(countyName, state).catch(console.error);

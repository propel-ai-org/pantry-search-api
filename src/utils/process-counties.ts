#!/usr/bin/env bun
// ABOUTME: CLI tool to systematically process all counties for food resource searches
// ABOUTME: Supports filtering by state, batch sizing, and force re-processing

import { initDatabase } from "../core/database";
import { getAllCounties, getCountiesByState, type County } from "../core/counties";
import { searchFoodResourcesByCounty } from "../search/county-search";

interface ProcessOptions {
  state?: string;
  batchSize: number;
  force: boolean;
}

function parseArgs(): ProcessOptions {
  const args = process.argv.slice(2);
  const options: ProcessOptions = {
    batchSize: 10,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--state=")) {
      options.state = arg.split("=")[1].toUpperCase();
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: bun process-counties.ts [options]

Process all counties to search for food pantries and banks.

Options:
  --state=XX          Process only counties in the specified state (e.g., --state=CA)
  --batch-size=N      Number of counties to process in each batch (default: 10)
  --force             Re-process counties that have already been searched
  --help, -h          Show this help message

Examples:
  bun process-counties.ts
  bun process-counties.ts --state=CA
  bun process-counties.ts --state=NY --batch-size=5
  bun process-counties.ts --force
      `);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log("Initializing database...");
  const db = await initDatabase();

  console.log("Loading counties...");
  const allCounties = options.state
    ? await getCountiesByState(options.state)
    : await getAllCounties();

  console.log(`Found ${allCounties.length} counties to consider`);

  // Get already-searched counties
  const searchedResult = await db<Array<{ county_geoid: string }>>`
    SELECT DISTINCT county_geoid
    FROM county_searches
  `;
  const searchedSet = new Set(searchedResult.map((c) => c.county_geoid));

  // Filter out already-searched counties unless --force is specified
  let countiesToProcess = allCounties;
  if (!options.force) {
    countiesToProcess = allCounties.filter((c) => !searchedSet.has(c.geoid));
    console.log(
      `${allCounties.length - countiesToProcess.length} counties already searched`
    );
  }

  console.log(`Processing ${countiesToProcess.length} counties...`);

  if (countiesToProcess.length === 0) {
    console.log("No counties to process. Use --force to re-process all.");
    process.exit(0);
  }

  let processed = 0;
  let totalFound = 0;

  // Process in batches
  for (let i = 0; i < countiesToProcess.length; i += options.batchSize) {
    const batch = countiesToProcess.slice(i, i + options.batchSize);

    console.log(
      `\nProcessing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(countiesToProcess.length / options.batchSize)} (counties ${i + 1}-${Math.min(i + batch.length, countiesToProcess.length)})`
    );

    for (const county of batch) {
      try {
        console.log(`  [${county.state}] ${county.name}...`);
        const result = await searchFoodResourcesByCounty(db, county);

        const total =
          result.pantries.length + result.banks.length + result.mixed.length;
        totalFound += total;
        processed++;

        console.log(
          `    ✓ Found ${total} resources (${result.pantries.length} pantries, ${result.banks.length} banks, ${result.mixed.length} mixed) ${result.cached ? "[cached]" : ""}`
        );

        // Small delay between searches to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`    ✗ Error processing ${county.name}:`, error);
      }
    }

    console.log(`\nProgress: ${processed}/${countiesToProcess.length} counties processed, ${totalFound} resources found`);
  }

  console.log(`\nCompleted! Processed ${processed} counties, found ${totalFound} total resources.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

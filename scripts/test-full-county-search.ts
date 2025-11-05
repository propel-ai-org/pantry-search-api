// Test the full county search integration with Google Places + OpenAI

import { initDatabase } from "../src/database";
import { searchFoodResourcesByCounty } from "../src/county-search";
import { findCounty } from "../src/counties";

const db = await initDatabase();

const county = await findCounty("Montgomery County", "PA");

if (!county) {
  console.error("Could not find Montgomery County, PA");
  process.exit(1);
}

console.log(`\n${"=".repeat(80)}`);
console.log(`Testing full county search for ${county.name}, ${county.state}`);
console.log(`${"=".repeat(80)}\n`);

const results = await searchFoodResourcesByCounty(db, county);

console.log(`\n${"=".repeat(80)}`);
console.log(`RESULTS SUMMARY`);
console.log(`${"=".repeat(80)}`);
console.log(`Total pantries: ${results.pantries.length}`);
console.log(`Total food banks: ${results.banks.length}`);
console.log(`Total mixed: ${results.mixed.length}`);
console.log(`Grand total: ${results.pantries.length + results.banks.length + results.mixed.length}`);
console.log(`Cached: ${results.cached}`);
console.log(`\n${"=".repeat(80)}\n`);

// Check for Jenkintown Food Cupboard
const allResources = [...results.pantries, ...results.banks, ...results.mixed];
const jenkintownMatch = allResources.find((r) =>
  r.name?.toLowerCase().includes("jenkintown")
);

if (jenkintownMatch) {
  console.log("✅ SUCCESS: Jenkintown Food Cupboard found!");
  console.log(JSON.stringify(jenkintownMatch, null, 2));
} else {
  console.log("❌ FAILED: Jenkintown Food Cupboard NOT found");
}

// Show first 20 results
console.log(`\nFirst 20 resources:\n`);
for (const resource of allResources.slice(0, 20)) {
  console.log(`- ${resource.name} (${resource.type})`);
  console.log(`  ${resource.address}, ${resource.city}, ${resource.state}`);
}

process.exit(0);

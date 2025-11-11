// One-off script to validate Google Places Text Search for Montgomery County, PA
// Should find Jenkintown Food Cupboard among other results

import { findCounty } from "../src/core/counties";
import { searchGooglePlaces } from "../src/search/google-places-search";

const county = await findCounty("Montgomery County", "PA");

if (!county) {
  console.error("Could not find Montgomery County, PA");
  process.exit(1);
}

console.log(`\nSearching for food resources in ${county.name}, ${county.state}`);
console.log(`County center: ${county.latitude}, ${county.longitude}\n`);

const results = await searchGooglePlaces(county);

console.log(`\n${"=".repeat(80)}`);
console.log(`RESULTS: Found ${results.length} food resources`);
console.log(`${"=".repeat(80)}\n`);

// Check if Jenkintown Food Cupboard is in results
const jenkintownMatch = results.find((r) =>
  r.name?.toLowerCase().includes("jenkintown")
);

if (jenkintownMatch) {
  console.log("✅ SUCCESS: Found Jenkintown Food Cupboard!");
  console.log(JSON.stringify(jenkintownMatch, null, 2));
  console.log("");
} else {
  console.log("❌ WARNING: Jenkintown Food Cupboard NOT found in results");
  console.log("");
}

// Display all results
for (const result of results) {
  console.log(`${result.name}`);
  console.log(`  Address: ${result.address}, ${result.city}, ${result.state} ${result.zip_code}`);
  console.log(`  Type: ${result.type}`);
  if (result.phone) console.log(`  Phone: ${result.phone}`);
  if (result.rating) console.log(`  Rating: ${result.rating}`);
  if (result.source_url) console.log(`  Website: ${result.source_url}`);
  console.log("");
}

console.log(`\nTotal: ${results.length} resources found`);

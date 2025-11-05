// Debug why Jenkintown is being filtered out

import { searchGooglePlaces } from "../src/google-places-search";
import { filterBySource } from "../src/source-filter";
import { findCounty } from "../src/counties";

const county = await findCounty("Montgomery County", "PA");

if (!county) {
  console.error("Could not find Montgomery County, PA");
  process.exit(1);
}

console.log("Step 1: Google Places Search\n");
const googleResults = await searchGooglePlaces(county);
console.log(`Found ${googleResults.length} results from Google Places`);

const jenkintownBefore = googleResults.find((r) =>
  r.name?.toLowerCase().includes("jenkintown")
);

if (jenkintownBefore) {
  console.log("\n✅ Jenkintown FOUND in Google Places results:");
  console.log(JSON.stringify(jenkintownBefore, null, 2));
} else {
  console.log("\n❌ Jenkintown NOT in Google Places results");
  process.exit(1);
}

console.log("\n\nStep 2: Source Filtering\n");
const filtered = filterBySource(googleResults);
console.log(`${googleResults.length} results before filtering`);
console.log(`${filtered.length} results after filtering`);

const jenkintownAfter = filtered.find((r) =>
  r.name?.toLowerCase().includes("jenkintown")
);

if (jenkintownAfter) {
  console.log("\n✅ Jenkintown SURVIVED source filtering");
} else {
  console.log("\n❌ Jenkintown was FILTERED OUT by source filter");
  console.log("\nJenkintown details before filtering:");
  console.log(`  Name: ${jenkintownBefore.name}`);
  console.log(`  Address: ${jenkintownBefore.address}`);
  console.log(`  Source URL: ${jenkintownBefore.source_url}`);
}

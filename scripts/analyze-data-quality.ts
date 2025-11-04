// ABOUTME: Analyzes data quality of enriched search results
// ABOUTME: Checks lat/long coverage, ratings, and verification status

const response = await fetch("http://localhost:3003/search?zip=94568");
const data = await response.json();

const all = [...data.pantries, ...data.banks, ...data.mixed];

console.log("=== DATA QUALITY ANALYSIS ===\n");

console.log(`Total resources: ${all.length}`);
console.log(`With lat/long: ${all.filter((r: any) => r.latitude && r.longitude).length} (${Math.round(all.filter((r: any) => r.latitude && r.longitude).length / all.length * 100)}%)`);
console.log(`With ratings: ${all.filter((r: any) => r.rating).length}`);
console.log(`With hours: ${all.filter((r: any) => r.hours).length}`);
console.log(`Verified: ${all.filter((r: any) => r.is_verified).length}`);

console.log("\n=== SAMPLE RESOURCE ===\n");
const sample = all[0];
console.log(`Name: ${sample.name}`);
console.log(`Address: ${sample.address}, ${sample.city}, ${sample.state} ${sample.zip_code}`);
console.log(`Location: ${sample.latitude}, ${sample.longitude}`);
console.log(`Rating: ${sample.rating || 'N/A'}`);
console.log(`Phone: ${sample.phone}`);
console.log(`Hours: ${sample.hours || 'N/A'}`);
console.log(`Verified: ${sample.is_verified ? 'Yes' : 'No'}`);
console.log(`Verification: ${sample.verification_notes}`);
console.log(`Source: ${sample.source_url}`);

console.log("\n=== RATINGS DISTRIBUTION ===\n");
const withRatings = all.filter((r: any) => r.rating);
if (withRatings.length > 0) {
  const avgRating = withRatings.reduce((sum: number, r: any) => sum + r.rating, 0) / withRatings.length;
  console.log(`Average rating: ${avgRating.toFixed(2)}/5.0`);
  console.log(`Highest: ${Math.max(...withRatings.map((r: any) => r.rating))}`);
  console.log(`Lowest: ${Math.min(...withRatings.map((r: any) => r.rating))}`);
}

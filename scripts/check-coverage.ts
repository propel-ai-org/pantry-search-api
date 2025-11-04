// ABOUTME: Script to check lat/long coverage and data quality
// ABOUTME: Analyzes search results to identify missing or problematic data

const response = await fetch("http://localhost:3002/search-county?county=Alameda%20County&state=CA");
const data = await response.json();

const all = [...data.pantries, ...data.banks, ...data.mixed];

console.log('Total resources:', all.length);
console.log('With lat/long:', all.filter((r: any) => r.latitude && r.longitude).length);
console.log('Missing lat/long:', all.filter((r: any) => !r.latitude || !r.longitude).length);

const sample = all.find((r: any) => r.name.includes('Hope for the Heart'));
console.log('\nHope for the Heart sample:');
console.log(JSON.stringify(sample, null, 2));

console.log('\nSample of resources missing lat/long:');
const missing = all.filter((r: any) => !r.latitude || !r.longitude).slice(0, 3);
missing.forEach((r: any) => {
  console.log(`- ${r.name}`);
  console.log(`  Address: ${r.address}`);
  console.log(`  Source: ${r.source_url}`);
});

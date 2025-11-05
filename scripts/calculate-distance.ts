// Calculate distance from Montgomery County center to Jenkintown Food Cupboard

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const countyLat = 40.209999;
const countyLon = -75.370201;
const jenkintownLat = 40.0931773;
const jenkintownLon = -75.1292825;

const distanceKm = haversineDistance(countyLat, countyLon, jenkintownLat, jenkintownLon);
const distanceMiles = distanceKm * 0.621371;

console.log(`Montgomery County center: ${countyLat}, ${countyLon}`);
console.log(`Jenkintown Food Cupboard: ${jenkintownLat}, ${jenkintownLon}`);
console.log(`Distance: ${distanceKm.toFixed(2)} km (${distanceMiles.toFixed(2)} miles)`);
console.log(`\nCurrent search radius: 50 km (31 miles)`);
console.log(jenkintownLat > countyLat ? "Jenkintown is WITHIN the search radius ✅" : "Jenkintown might be outside search radius");

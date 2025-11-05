// Test if Jenkintown Food Cupboard exists in Google Places at all

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const query = "Jenkintown Food Cupboard 328 Summit Ave Jenkintown PA";

console.log(`Searching Google Places for: "${query}"\n`);

const url = "https://places.googleapis.com/v1/places:searchText";

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.businessStatus",
      "places.rating",
      "places.userRatingCount",
      "places.nationalPhoneNumber",
      "places.websiteUri",
      "places.types",
    ].join(","),
  },
  body: JSON.stringify({
    textQuery: query,
  }),
});

const data = await response.json();

console.log("Response:");
console.log(JSON.stringify(data, null, 2));

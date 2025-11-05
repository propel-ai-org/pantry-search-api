// ABOUTME: Google Places Text Search API integration for discovering food resources
// ABOUTME: Uses keyword-based search to find food pantries and banks in geographic areas

import type { FoodResource } from "./database";
import type { County } from "./counties";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlacesTextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
    businessStatus?: string;
    rating?: number;
    userRatingCount?: number;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    regularOpeningHours?: {
      weekdayDescriptions: string[];
    };
    types?: string[];
  }>;
  nextPageToken?: string;
}

/**
 * Search for food resources using Google Places Text Search API
 * This provides direct access to Google's places database to discover food pantries
 */
export async function searchGooglePlaces(
  county: County
): Promise<Partial<FoodResource>[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("Google Places API key not configured, skipping Places search");
    return [];
  }

  const queries = [
    `food pantry in ${county.name}, ${county.state}`,
    `food bank in ${county.name}, ${county.state}`,
    `emergency food assistance in ${county.name}, ${county.state}`,
  ];

  const allResults: Partial<FoodResource>[] = [];

  for (const query of queries) {
    console.log(`  Google Places search: "${query}"`);

    try {
      const results = await performTextSearch(query, county);
      console.log(`    Found ${results.length} results`);
      allResults.push(...results);

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`    Error searching Google Places: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Google Places total: ${allResults.length} resources from ${queries.length} queries`);
  return allResults;
}

async function performTextSearch(
  query: string,
  county: County
): Promise<Partial<FoodResource>[]> {
  // Calculate search radius based on county area (larger counties need bigger radius)
  // Most US counties are 20-50 miles wide, so we'll use a 50km (~31 mile) radius
  const radiusMeters = 50000;

  const allPlaces: PlacesTextSearchResponse["places"] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3; // Max 60 results (20 per page * 3 pages)

  do {
    const requestBody: any = {
      textQuery: query,
      pageSize: 20, // Max results per page
      locationBias: {
        circle: {
          center: {
            latitude: county.latitude,
            longitude: county.longitude,
          },
          radius: radiusMeters,
        },
      },
    };

    if (pageToken) {
      requestBody.pageToken = pageToken;
    }

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
          "places.regularOpeningHours",
          "places.types",
          "nextPageToken",
        ].join(","),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Places API error: ${response.status} - ${errorText}`);
    }

    const data: PlacesTextSearchResponse = await response.json();

    if (data.places && data.places.length > 0) {
      allPlaces.push(...data.places);
    }

    pageToken = data.nextPageToken;
    pageCount++;

    // Small delay between pagination requests
    if (pageToken && pageCount < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } while (pageToken && pageCount < maxPages);

  if (allPlaces.length === 0) {
    return [];
  }

  // Convert Google Places results to our FoodResource format
  const results: Partial<FoodResource>[] = [];

  for (const place of allPlaces) {
    // Skip permanently or temporarily closed places
    if (place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") {
      continue;
    }

    // Skip non-food-assistance places
    if (place.types && shouldExcludeByType(place.types)) {
      continue;
    }

    // Parse address components
    const addressParts = place.formattedAddress?.split(", ") || [];
    const streetAddress = addressParts[0] || "";
    const city = addressParts.length >= 3 ? addressParts[addressParts.length - 3] : null;
    const stateZip = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : "";
    const state = stateZip.split(" ")[0];
    const zipCode = stateZip.split(" ")[1];

    // Format hours
    let hours: string | undefined;
    if (place.regularOpeningHours?.weekdayDescriptions) {
      hours = place.regularOpeningHours.weekdayDescriptions.join("; ");
    }

    // Determine type (this is a best guess - we'll classify as "mixed" by default)
    let type: "pantry" | "bank" | "mixed" = "mixed";
    const name = place.displayName?.text || "";
    if (name.toLowerCase().includes("food bank")) {
      type = "bank";
    } else if (name.toLowerCase().includes("pantry") || name.toLowerCase().includes("cupboard")) {
      type = "pantry";
    }

    results.push({
      name: name,
      address: streetAddress,
      city: city || undefined,
      state: state || county.state,
      zip_code: zipCode || undefined,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      type,
      phone: place.nationalPhoneNumber,
      hours,
      rating: place.rating,
      source_url: place.websiteUri,
      is_verified: true,
      verification_notes: `Found via Google Places Text Search API${place.userRatingCount ? ` (${place.userRatingCount} reviews)` : ""}`,
      google_place_id: place.id,
    });
  }

  return results;
}

/**
 * Check if place types indicate this is not a food assistance location
 */
function shouldExcludeByType(types: string[]): boolean {
  const blockedTypes = [
    "school",
    "primary_school",
    "secondary_school",
    "university",
    "restaurant",
    "cafe",
    "meal_takeaway",
    "meal_delivery",
    "supermarket",
    "grocery_or_supermarket",
    "convenience_store",
    "store",
    "bar",
    "night_club",
    "shopping_mall",
  ];

  return types.some((type) => blockedTypes.includes(type));
}

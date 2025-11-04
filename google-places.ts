// ABOUTME: Google Places API integration for location data enrichment
// ABOUTME: Verifies addresses, gets coordinates, and checks operational status

import type { FoodResource } from "./database";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlacesSearchResult {
  candidates: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    business_status?: string;
    rating?: number;
    user_ratings_total?: number;
    formatted_phone_number?: string;
  }>;
  status: string;
}

interface PlaceDetailsResult {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    business_status?: string;
    rating?: number;
    user_ratings_total?: number;
    formatted_phone_number?: string;
    opening_hours?: {
      weekday_text: string[];
    };
    website?: string;
  };
  status: string;
}

export async function enrichWithGooglePlaces(
  resource: Partial<FoodResource>
): Promise<Partial<FoodResource> | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("Google Places API key not configured");
    return resource;
  }

  try {
    // Build search query
    const query = buildSearchQuery(resource);
    console.log(`Enriching: ${resource.name} with query: "${query}"`);

    // Find Place using Text Search
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,business_status,rating,user_ratings_total&key=${GOOGLE_PLACES_API_KEY}`;

    const searchResponse = await fetch(searchUrl);
    const searchData: PlacesSearchResult = await searchResponse.json();

    if (searchData.status !== "OK" || searchData.candidates.length === 0) {
      console.log(`  ❌ Not found in Google Places`);
      return null; // Resource not found, reject it
    }

    const candidate = searchData.candidates[0];

    // Check if permanently closed
    if (
      candidate.business_status === "CLOSED_PERMANENTLY" ||
      candidate.business_status === "CLOSED_TEMPORARILY"
    ) {
      console.log(`  ⚠️  Business status: ${candidate.business_status}`);
      return null; // Closed, reject it
    }

    // Get detailed information
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=formatted_phone_number,opening_hours,website&key=${GOOGLE_PLACES_API_KEY}`;

    const detailsResponse = await fetch(detailsUrl);
    const detailsData: PlaceDetailsResult = await detailsResponse.json();

    // Extract address components
    const addressParts = candidate.formatted_address.split(", ");
    const city =
      addressParts.length >= 3 ? addressParts[addressParts.length - 3] : null;
    const stateZip =
      addressParts.length >= 2 ? addressParts[addressParts.length - 2] : "";
    const state = stateZip.split(" ")[0];
    const zipCode = stateZip.split(" ")[1];

    // Combine hours if available
    let hours = resource.hours;
    if (
      detailsData.status === "OK" &&
      detailsData.result.opening_hours?.weekday_text
    ) {
      hours = detailsData.result.opening_hours.weekday_text.join("; ");
    }

    console.log(
      `  ✅ Found: ${candidate.formatted_address} (${candidate.geometry.location.lat}, ${candidate.geometry.location.lng})`
    );

    return {
      ...resource,
      address: candidate.formatted_address.split(",")[0], // Street address only
      city: city || resource.city,
      state: state || resource.state,
      zip_code: zipCode || resource.zip_code,
      latitude: candidate.geometry.location.lat,
      longitude: candidate.geometry.location.lng,
      rating: candidate.rating || resource.rating,
      phone:
        detailsData.result.formatted_phone_number ||
        resource.phone ||
        candidate.formatted_phone_number,
      hours: hours,
      source_url: detailsData.result.website || resource.source_url,
      is_verified: true,
      verification_notes: `Verified via Google Places API (place_id: ${candidate.place_id})${candidate.user_ratings_total ? ` with ${candidate.user_ratings_total} reviews` : ""}`,
    };
  } catch (error) {
    console.error(`  ❌ Error enriching ${resource.name}:`, error);
    return null; // Failed to enrich, reject it
  }
}

function buildSearchQuery(resource: Partial<FoodResource>): string {
  const parts: string[] = [];

  if (resource.name) {
    parts.push(resource.name);
  }

  // Include type in query to help find the right place
  if (resource.type === "pantry") {
    parts.push("food pantry");
  } else if (resource.type === "bank") {
    parts.push("food bank");
  }

  // Add location info
  if (resource.address && resource.address !== "Not specified") {
    parts.push(resource.address);
  }

  if (resource.city && resource.city !== "Not specified") {
    parts.push(resource.city);
  }

  if (resource.state) {
    parts.push(resource.state);
  }

  return parts.join(" ");
}

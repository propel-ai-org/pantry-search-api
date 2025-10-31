// ABOUTME: Google Places API integration for finding food resources
// ABOUTME: Searches for food pantries and banks near a zip code with verification

import { Client } from "@googlemaps/google-maps-services-js";
import type { FoodResource } from "./database";

const client = new Client({});

interface PlaceDetails {
  name: string;
  formatted_address?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_phone_number?: string;
  opening_hours?: {
    weekday_text?: string[];
  };
  business_status?: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: Array<{
    text: string;
    time: number;
  }>;
  types?: string[];
  place_id: string;
}

export async function searchWithPlaces(
  zipCode: string
): Promise<Partial<FoodResource>[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY environment variable is not set");
  }

  try {
    // First, geocode the zip code to get coordinates
    const geocodeResponse = await client.geocode({
      params: {
        address: zipCode,
        key: apiKey,
      },
    });

    if (geocodeResponse.data.results.length === 0) {
      throw new Error(`Could not find location for zip code: ${zipCode}`);
    }

    const location = geocodeResponse.data.results[0].geometry.location;

    // Search for food pantries and food banks
    const searchQueries = ["food pantry", "food bank"];
    const allResults: PlaceDetails[] = [];

    for (const query of searchQueries) {
      const searchResponse = await client.textSearch({
        params: {
          query: `${query} near ${zipCode}`,
          location,
          radius: 16000, // 10 miles in meters
          key: apiKey,
        },
      });

      allResults.push(...(searchResponse.data.results as PlaceDetails[]));
    }

    // Get details for each place to verify status
    const detailedResults: Partial<FoodResource>[] = [];

    for (const place of allResults.slice(0, 10)) {
      try {
        const details = await client.placeDetails({
          params: {
            place_id: place.place_id,
            fields: [
              "name",
              "formatted_address",
              "geometry",
              "formatted_phone_number",
              "opening_hours",
              "business_status",
              "rating",
              "user_ratings_total",
              "reviews",
              "types",
            ],
            key: apiKey,
          },
        });

        const placeDetails = details.data.result as PlaceDetails;

        // Extract address components
        const addressParts = placeDetails.formatted_address?.split(", ") || [];
        const city = addressParts[addressParts.length - 3] || "";
        const stateZip = addressParts[addressParts.length - 2]?.split(" ") || [];
        const state = stateZip[0] || "";

        // Determine type based on name and types
        const type = categorizePlace(
          placeDetails.name,
          placeDetails.types || []
        );

        // Check if place is currently operating
        const isVerified = placeDetails.business_status === "OPERATIONAL";

        // Extract notes from reviews about wait times
        const notes = extractNotesFromReviews(placeDetails);

        // Format hours
        const hours = placeDetails.opening_hours?.weekday_text?.join("; ") || "";

        const resource: Partial<FoodResource> = {
          name: placeDetails.name,
          address: addressParts.slice(0, -2).join(", "),
          city,
          state,
          zip_code: zipCode,
          latitude: placeDetails.geometry?.location.lat,
          longitude: placeDetails.geometry?.location.lng,
          type,
          phone: placeDetails.formatted_phone_number,
          hours: hours.length > 0 ? hours : undefined,
          notes,
          is_verified: isVerified,
          verification_notes: isVerified
            ? "Verified via Google Places API as operational"
            : "Status unknown or not operational",
          source_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        };

        detailedResults.push(resource);
      } catch (error) {
        console.error(`Failed to get details for place ${place.name}:`, error);
        continue;
      }
    }

    return detailedResults;
  } catch (error) {
    console.error("Places search error:", error);
    throw new Error(
      `Failed to search with Places API: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function categorizePlace(name: string, types: string[]): "pantry" | "bank" | "mixed" {
  const nameLower = name.toLowerCase();

  if (nameLower.includes("food bank")) {
    return "bank";
  }

  if (nameLower.includes("food pantry") || nameLower.includes("pantry")) {
    return "pantry";
  }

  // Check if it's a church or community center (likely a pantry)
  if (
    types.includes("church") ||
    types.includes("community_center") ||
    nameLower.includes("church") ||
    nameLower.includes("community")
  ) {
    return "pantry";
  }

  return "mixed";
}

function extractNotesFromReviews(place: PlaceDetails): string | undefined {
  if (!place.reviews || place.reviews.length === 0) {
    return undefined;
  }

  const notes: string[] = [];

  // Look for mentions of wait times, service quality, etc.
  const keywords = ["wait", "line", "friendly", "helpful", "long", "quick", "fast"];

  for (const review of place.reviews.slice(0, 3)) {
    const reviewLower = review.text.toLowerCase();

    for (const keyword of keywords) {
      if (reviewLower.includes(keyword)) {
        // Extract the sentence containing the keyword
        const sentences = review.text.split(/[.!?]/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(keyword)) {
            notes.push(sentence.trim());
            break;
          }
        }
        break;
      }
    }
  }

  if (place.rating && place.user_ratings_total) {
    notes.unshift(
      `Rated ${place.rating}/5 stars based on ${place.user_ratings_total} reviews`
    );
  }

  return notes.length > 0 ? notes.join(". ") : undefined;
}

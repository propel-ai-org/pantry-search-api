// ABOUTME: Google Places API integration for location data enrichment
// ABOUTME: Verifies addresses, gets coordinates, and checks operational status

import type { FoodResource } from "./database";
import { extractSocialMediaLinks } from "./social-media-extractor";

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
    types?: string[];
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

interface EnrichmentResult {
  data: Partial<FoodResource> | null;
  failureReason?: string;
}

export async function enrichWithGooglePlaces(
  resource: Partial<FoodResource>
): Promise<EnrichmentResult> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("Google Places API key not configured");
    return { data: resource as Partial<FoodResource>, failureReason: "API key not configured" };
  }

  try {
    // Build search query
    const query = buildSearchQuery(resource);
    console.log(`Enriching: ${resource.name} with query: "${query}"`);

    // Find Place using Text Search
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,business_status,rating,user_ratings_total,types&key=${GOOGLE_PLACES_API_KEY}`;

    const searchResponse = await fetch(searchUrl);
    const searchData: PlacesSearchResult = await searchResponse.json();

    if (searchData.status !== "OK" || searchData.candidates.length === 0) {
      console.log(`  ❌ Not found in Google Places`);
      return { data: null, failureReason: "Not found in Google Places" };
    }

    const candidate = searchData.candidates[0];

    // Check if permanently closed
    if (candidate.business_status === "CLOSED_PERMANENTLY") {
      console.log(`  ⚠️  Business status: ${candidate.business_status}`);
      return { data: null, failureReason: "Permanently closed" };
    }

    if (candidate.business_status === "CLOSED_TEMPORARILY") {
      console.log(`  ⚠️  Business status: ${candidate.business_status}`);
      return { data: null, failureReason: "Temporarily closed" };
    }

    // Validate that the name reasonably matches what we searched for
    const matchResult = isReasonableMatch(resource.name || "", candidate.name);
    if (!matchResult.isMatch) {
      console.log(`  ⚠️  Name mismatch: searched for "${resource.name}", found "${candidate.name}"`);

      // If it's a close match, accept it anyway
      if (matchResult.isCloseMatch) {
        console.log(`  ℹ️  Accepting close match (${matchResult.matchRatio.toFixed(2)} similarity)`);
      } else {
        return { data: null, failureReason: `Name mismatch: found "${candidate.name}"` };
      }
    }

    // Check types to filter out non-food-assistance locations
    if (candidate.types && candidate.types.length > 0) {
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
      ];

      const hasBlockedType = candidate.types.some((type) =>
        blockedTypes.includes(type)
      );

      if (hasBlockedType) {
        console.log(
          `  ⚠️  Blocked type: ${candidate.name} has types [${candidate.types.join(", ")}]`
        );
        return { data: null, failureReason: `Blocked type: ${candidate.types.join(", ")}` };
      }
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

    // Extract social media links from the website
    const websiteUrl = detailsData.result.website || resource.source_url;
    let socialMediaLinks = {};
    if (websiteUrl) {
      socialMediaLinks = await extractSocialMediaLinks(websiteUrl, resource.name);
    }

    return {
      data: {
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
        source_url: websiteUrl,
        url_facebook: socialMediaLinks.facebook || resource.url_facebook,
        url_twitter: socialMediaLinks.twitter || resource.url_twitter,
        url_instagram: socialMediaLinks.instagram || resource.url_instagram,
        url_youtube: socialMediaLinks.youtube || resource.url_youtube,
        is_verified: true,
        verification_notes: `Verified via Google Places API (place_id: ${candidate.place_id})${candidate.user_ratings_total ? ` with ${candidate.user_ratings_total} reviews` : ""}`,
        google_place_id: candidate.place_id,
      }
    };
  } catch (error) {
    console.error(`  ❌ Error enriching ${resource.name}:`, error);
    return { data: null, failureReason: `API error: ${error instanceof Error ? error.message : String(error)}` };
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

interface MatchResult {
  isMatch: boolean;
  isCloseMatch: boolean;
  matchRatio: number;
}

function isReasonableMatch(searchedName: string, foundName: string): MatchResult {
  // Normalize both names for comparison
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

  const normalizedSearched = normalize(searchedName);
  const normalizedFound = normalize(foundName);

  // Extract significant words (ignore common words)
  const commonWords = new Set([
    "food",
    "pantry",
    "bank",
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "at",
    "in",
    "for",
    "to",
    "community",
    "center",
    "program",
  ]);

  const getSignificantWords = (str: string) =>
    str
      .split(" ")
      .filter((word) => word.length > 2 && !commonWords.has(word));

  const searchedWords = new Set(getSignificantWords(normalizedSearched));
  const foundWords = new Set(getSignificantWords(normalizedFound));

  // Check if at least 50% of significant words match
  if (searchedWords.size === 0 || foundWords.size === 0) {
    return { isMatch: true, isCloseMatch: false, matchRatio: 1.0 }; // Can't validate, allow through
  }

  let matchCount = 0;
  for (const word of searchedWords) {
    if (foundWords.has(word)) {
      matchCount++;
    }
  }

  const matchRatio = matchCount / Math.min(searchedWords.size, foundWords.size);

  return {
    isMatch: matchRatio >= 0.5,
    isCloseMatch: matchRatio >= 0.3, // 30% match is "close enough" to consider
    matchRatio
  };
}

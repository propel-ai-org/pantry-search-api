// ABOUTME: Tests for Google Places API enrichment functionality
// ABOUTME: Validates place_id population, geocoding fallback, and address verification

import { test, expect, mock } from "bun:test";
import { enrichWithGooglePlaces } from "./google-places";
import type { FoodResource } from "../core/database";

// Mock fetch globally
const originalFetch = global.fetch;

test("should populate place_id when Google Places search succeeds", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Community Food Pantry",
    address: "123 Main St",
    city: "Philadelphia",
    state: "PA",
    zip_code: "19123",
  };

  // Mock successful Google Places search
  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "OK",
        candidates: [{
          place_id: "ChIJtest_place_id_123",
          name: "Community Food Pantry",
          formatted_address: "123 Main St, Philadelphia, PA 19123, USA",
          geometry: {
            location: { lat: 39.9526, lng: -75.1652 }
          },
          business_status: "OPERATIONAL",
          types: ["food"]
        }]
      });
    }
    if (url.includes("place/details")) {
      return Response.json({
        status: "OK",
        result: {
          formatted_phone_number: "(215) 555-1234",
          website: "https://example.com"
        }
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  expect(result.data).not.toBeNull();
  expect(result.data?.google_place_id).toBe("ChIJtest_place_id_123");
  expect(result.data?.latitude).toBe(39.9526);
  expect(result.data?.longitude).toBe(-75.1652);

  global.fetch = originalFetch;
});

test("should populate place_id when geocoding fallback is used", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Small Community Pantry",
    address: "456 Oak Ave",
    city: "Philadelphia",
    state: "PA",
    zip_code: "19123",
  };

  // Mock Google Places search failing, then geocoding succeeding
  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "ZERO_RESULTS",
        candidates: []
      });
    }
    if (url.includes("geocode/json")) {
      return Response.json({
        status: "OK",
        results: [{
          place_id: "ChIJtest_geocode_place_id_456",
          formatted_address: "456 Oak Ave, Philadelphia, PA 19123, USA",
          geometry: {
            location: { lat: 39.9600, lng: -75.1700 }
          },
          address_components: [
            { long_name: "Philadelphia", short_name: "Philadelphia", types: ["locality"] },
            { long_name: "PA", short_name: "PA", types: ["administrative_area_level_1"] },
            { long_name: "19123", short_name: "19123", types: ["postal_code"] }
          ]
        }]
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  expect(result.data).not.toBeNull();
  expect(result.data?.google_place_id).toBe("ChIJtest_geocode_place_id_456");
  expect(result.data?.latitude).toBe(39.9600);
  expect(result.data?.longitude).toBe(-75.1700);
  expect(result.data?.verification_notes).toContain("Geocoding API (fallback)");

  global.fetch = originalFetch;
});

test("should handle permanently closed businesses", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Closed Food Bank",
    address: "789 Pine St",
    city: "Philadelphia",
    state: "PA",
  };

  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "OK",
        candidates: [{
          place_id: "ChIJtest_closed",
          name: "Closed Food Bank",
          formatted_address: "789 Pine St, Philadelphia, PA 19103, USA",
          geometry: {
            location: { lat: 39.9500, lng: -75.1600 }
          },
          business_status: "CLOSED_PERMANENTLY",
          types: ["food"]
        }]
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  expect(result.data).toBeNull();
  expect(result.failureReason).toBe("Permanently closed");

  global.fetch = originalFetch;
});

test("should fall back to geocoding when temporarily closed", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Temporarily Closed Pantry",
    address: "321 Elm St",
    city: "Philadelphia",
    state: "PA",
    zip_code: "19102",
  };

  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "OK",
        candidates: [{
          place_id: "ChIJtest_temp_closed",
          name: "Temporarily Closed Pantry",
          formatted_address: "321 Elm St, Philadelphia, PA 19102, USA",
          geometry: {
            location: { lat: 39.9520, lng: -75.1630 }
          },
          business_status: "CLOSED_TEMPORARILY",
          types: ["food"]
        }]
      });
    }
    if (url.includes("geocode/json")) {
      return Response.json({
        status: "OK",
        results: [{
          place_id: "ChIJtest_geocode_temp_closed",
          formatted_address: "321 Elm St, Philadelphia, PA 19102, USA",
          geometry: {
            location: { lat: 39.9520, lng: -75.1630 }
          },
          address_components: [
            { long_name: "Philadelphia", short_name: "Philadelphia", types: ["locality"] },
            { long_name: "PA", short_name: "PA", types: ["administrative_area_level_1"] },
            { long_name: "19102", short_name: "19102", types: ["postal_code"] }
          ]
        }]
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  expect(result.data).not.toBeNull();
  expect(result.data?.google_place_id).toBe("ChIJtest_geocode_temp_closed");
  expect(result.data?.verification_notes).toContain("Geocoding API (fallback)");

  global.fetch = originalFetch;
});

test("should handle geocoding failure gracefully", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Bad Address Pantry",
    address: "999 Nonexistent St",
    city: "Nowhere",
    state: "XX",
  };

  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "ZERO_RESULTS",
        candidates: []
      });
    }
    if (url.includes("geocode/json")) {
      return Response.json({
        status: "ZERO_RESULTS",
        results: []
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  expect(result.data).toBeNull();
  expect(result.failureReason).toBe("Geocoding failed: ZERO_RESULTS");

  global.fetch = originalFetch;
});

test("should block restaurants and supermarkets", async () => {
  const mockResource: Partial<FoodResource> = {
    name: "Some Restaurant",
    address: "100 Food St",
    city: "Philadelphia",
    state: "PA",
  };

  global.fetch = mock(async (url: string) => {
    if (url.includes("findplacefromtext")) {
      return Response.json({
        status: "OK",
        candidates: [{
          place_id: "ChIJtest_restaurant",
          name: "Some Restaurant",
          formatted_address: "100 Food St, Philadelphia, PA 19103, USA",
          geometry: {
            location: { lat: 39.9500, lng: -75.1600 }
          },
          business_status: "OPERATIONAL",
          types: ["restaurant", "food", "establishment"]
        }]
      });
    }
    if (url.includes("geocode/json")) {
      return Response.json({
        status: "OK",
        results: [{
          place_id: "ChIJtest_geocode_restaurant",
          formatted_address: "100 Food St, Philadelphia, PA 19103, USA",
          geometry: {
            location: { lat: 39.9500, lng: -75.1600 }
          },
          address_components: []
        }]
      });
    }
    return Response.json({});
  });

  const result = await enrichWithGooglePlaces(mockResource);

  // Should fall back to geocoding and still get a place_id
  expect(result.data).not.toBeNull();
  expect(result.data?.google_place_id).toBe("ChIJtest_geocode_restaurant");

  global.fetch = originalFetch;
});

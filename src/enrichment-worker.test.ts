// ABOUTME: Tests for parallel enrichment worker functionality
// ABOUTME: Validates concurrent request processing and rate limiting

import { test, expect } from "bun:test";
import { startEnrichmentWorker } from "./enrichment-worker";
import type { Database } from "bun:sql";
import type { FoodResource } from "./database";
import type { EnrichmentResult } from "./google-places";

test("should process up to 5 requests concurrently", async () => {
  const updateCalls: string[] = [];
  let activeRequests = 0;
  let maxConcurrentRequests = 0;

  // Create mock resources
  const mockResources: FoodResource[] = Array.from({ length: 10 }, (_, i) => ({
    id: `resource-${i}`,
    name: `Test Resource ${i}`,
    address: "123 Test St",
    city: "Test City",
    state: "CA",
    zip_code: "12345",
    county: "Test County",
    latitude: null,
    longitude: null,
    phone: null,
    hours: null,
    resource_type: "pantry" as const,
    source: "test",
    source_id: `test-${i}`,
    source_url: null,
    rating: null,
    last_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    needs_enrichment: true,
    last_enrichment_attempt: null,
    enrichment_failure_count: 0,
    enrichment_failure_reason: null,
    wheelchair_accessible: null,
    has_curbside_pickup: null,
    has_delivery: null,
    has_takeout: null,
    editorial_summary: null,
    verification_notes: null,
    google_place_id: null,
  }));

  // Mock enrichment function that tracks concurrency
  const mockEnrichFn = async (resource: FoodResource): Promise<EnrichmentResult> => {
    activeRequests++;
    maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200));

    activeRequests--;

    return {
      data: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: "123 Test St",
        city: "San Francisco",
        state: "CA",
        zip_code: "94102",
        phone: "555-1234",
        hours: "Mon-Fri 9am-5pm",
        rating: 4.5,
        source_url: "https://example.com",
        wheelchair_accessible: true,
        has_curbside_pickup: false,
        has_delivery: false,
        has_takeout: false,
        editorial_summary: "Great food pantry",
        verification_notes: "Verified via Google Places",
        google_place_id: "ChIJtest123",
      },
      failureReason: undefined,
    };
  };

  const mockDb = {
    async query(sql: string, params?: any[]) {
      if (sql.includes("SELECT * FROM resources WHERE needs_enrichment")) {
        // Return available resources based on how many we've processed
        const remaining = mockResources.filter(r => r.needs_enrichment);
        return remaining.slice(0, params?.[0] || 5);
      }
      if (sql.includes("UPDATE resources SET")) {
        const resourceId = params?.[params.length - 1];
        updateCalls.push(resourceId);
        // Mark as no longer needing enrichment
        const resource = mockResources.find(r => r.id === resourceId);
        if (resource) {
          resource.needs_enrichment = false;
        }
      }
      return [];
    },
  };

  // Create a tagged template function that matches the db API
  const db = Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "");
      }, "");
      return mockDb.query(sql, values);
    },
    { end: async () => {} }
  ) as unknown as Database;

  const stopWorker = startEnrichmentWorker(db, mockEnrichFn);

  // Wait for enrichment to process some resources
  await new Promise(resolve => setTimeout(resolve, 1500));

  stopWorker();

  // Verify we processed multiple resources concurrently
  expect(maxConcurrentRequests).toBeGreaterThan(1);
  expect(maxConcurrentRequests).toBeLessThanOrEqual(5);

  // Verify we made progress
  expect(updateCalls.length).toBeGreaterThan(0);

  console.log(`Max concurrent requests: ${maxConcurrentRequests}`);
  console.log(`Total resources processed: ${updateCalls.length}`);
});

test("should handle enrichment failures gracefully", async () => {
  let failureUpdateCalls = 0;

  const mockResource: FoodResource = {
    id: "fail-resource",
    name: "Failing Resource",
    address: "123 Test St",
    city: "Test City",
    state: "CA",
    zip_code: "12345",
    county: "Test County",
    latitude: null,
    longitude: null,
    phone: null,
    hours: null,
    resource_type: "pantry",
    source: "test",
    source_id: "test-fail",
    source_url: null,
    rating: null,
    last_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    needs_enrichment: true,
    last_enrichment_attempt: null,
    enrichment_failure_count: 0,
    enrichment_failure_reason: null,
    wheelchair_accessible: null,
    has_curbside_pickup: null,
    has_delivery: null,
    has_takeout: null,
    editorial_summary: null,
    verification_notes: null,
    google_place_id: null,
  };

  const mockEnrichFn = async (): Promise<EnrichmentResult> => {
    return {
      data: null,
      failureReason: "Not found",
    };
  };

  const mockDb = {
    async query(sql: string) {
      if (sql.includes("SELECT * FROM resources WHERE needs_enrichment")) {
        return [mockResource];
      }
      if (sql.includes("UPDATE resources SET") && sql.includes("enrichment_failure_count")) {
        failureUpdateCalls++;
      }
      return [];
    },
  };

  const db = Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "");
      }, "");
      return mockDb.query(sql, values);
    },
    { end: async () => {} }
  ) as unknown as Database;

  const stopWorker = startEnrichmentWorker(db, mockEnrichFn);

  // Wait for enrichment to attempt processing
  await new Promise(resolve => setTimeout(resolve, 500));

  stopWorker();

  // Verify failure was recorded
  expect(failureUpdateCalls).toBeGreaterThan(0);
});

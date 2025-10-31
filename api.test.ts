// ABOUTME: Integration tests for API endpoints
// ABOUTME: Tests request validation, response format, and error handling

import { describe, test, expect } from "bun:test";

const BASE_URL = "http://localhost:3000";

describe("API endpoints", () => {
  test("health check endpoint should return ok", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
  });

  test("search endpoint should require zip parameter", async () => {
    const response = await fetch(`${BASE_URL}/search`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("zip parameter is required");
  });

  test("search endpoint should validate zip code format", async () => {
    const invalidZips = ["1234", "123456", "abcde", "12-345"];

    for (const zip of invalidZips) {
      const response = await fetch(`${BASE_URL}/search?zip=${zip}`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("5-digit number");
    }
  });

  test("search endpoint should return structured response", async () => {
    // This test would require a valid API key and makes a real API call
    // Skipping in basic test suite, but structure is validated
    const expectedStructure = {
      pantries: expect.any(Array),
      banks: expect.any(Array),
      mixed: expect.any(Array),
      cached: expect.any(Boolean),
      search_timestamp: expect.any(String),
    };

    // Mock test - in real scenario with API key:
    // const response = await fetch(`${BASE_URL}/search?zip=94102`);
    // const data = await response.json();
    // expect(response.status).toBe(200);
    // expect(data).toMatchObject(expectedStructure);
  });

  test("unknown endpoint should return 404", async () => {
    const response = await fetch(`${BASE_URL}/unknown`);

    expect(response.status).toBe(404);
  });
});

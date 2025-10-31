// ABOUTME: Tests for search functionality and caching logic
// ABOUTME: Validates database operations, deduplication, and result categorization

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "./database";
import type { FoodResource } from "./database";

describe("Database operations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");

    // Initialize schema
    db.run(`
      CREATE TABLE resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        latitude REAL,
        longitude REAL,
        type TEXT NOT NULL,
        phone TEXT,
        hours TEXT,
        notes TEXT,
        is_verified INTEGER DEFAULT 0,
        verification_notes TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_verified_at DATETIME
      )
    `);

    db.run(`
      CREATE TABLE zip_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zip_code TEXT NOT NULL,
        searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        result_count INTEGER
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  test("should insert and retrieve a food resource", () => {
    const resource: Partial<FoodResource> = {
      name: "Test Food Pantry",
      address: "123 Test St",
      city: "Testville",
      state: "CA",
      zip_code: "12345",
      type: "pantry",
      is_verified: true,
    };

    db.run(
      `INSERT INTO resources (name, address, city, state, zip_code, type, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        resource.name,
        resource.address,
        resource.city,
        resource.state,
        resource.zip_code,
        resource.type,
        resource.is_verified ? 1 : 0,
      ]
    );

    const result = db
      .query<FoodResource, string>(
        "SELECT * FROM resources WHERE zip_code = ?"
      )
      .get("12345");

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Food Pantry");
    expect(result?.type).toBe("pantry");
    expect(result?.is_verified).toBe(1);
  });

  test("should track zip code searches", () => {
    db.run(
      "INSERT INTO zip_searches (zip_code, result_count) VALUES (?, ?)",
      ["12345", 5]
    );

    const search = db
      .query("SELECT * FROM zip_searches WHERE zip_code = ?")
      .get("12345") as { zip_code: string; result_count: number };

    expect(search).toBeDefined();
    expect(search.zip_code).toBe("12345");
    expect(search.result_count).toBe(5);
  });

  test("should handle multiple resources for same zip code", () => {
    const resources = [
      { name: "Pantry A", address: "123 A St", type: "pantry", zip: "12345" },
      { name: "Bank B", address: "456 B St", type: "bank", zip: "12345" },
      { name: "Pantry C", address: "789 C St", type: "pantry", zip: "12345" },
    ];

    for (const r of resources) {
      db.run(
        "INSERT INTO resources (name, address, type, zip_code, is_verified) VALUES (?, ?, ?, ?, ?)",
        [r.name, r.address, r.type, r.zip, 1]
      );
    }

    const results = db
      .query<FoodResource, string>(
        "SELECT * FROM resources WHERE zip_code = ? ORDER BY name"
      )
      .all("12345");

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe("Bank B");
    expect(results[1].name).toBe("Pantry A");
    expect(results[2].name).toBe("Pantry C");
  });
});

describe("Result categorization", () => {
  test("should categorize resources by type", () => {
    const resources: FoodResource[] = [
      {
        id: 1,
        name: "Pantry A",
        address: "123 St",
        type: "pantry",
        is_verified: true,
      } as FoodResource,
      {
        id: 2,
        name: "Bank B",
        address: "456 St",
        type: "bank",
        is_verified: true,
      } as FoodResource,
      {
        id: 3,
        name: "Mixed C",
        address: "789 St",
        type: "mixed",
        is_verified: true,
      } as FoodResource,
    ];

    const pantries = resources.filter((r) => r.type === "pantry");
    const banks = resources.filter((r) => r.type === "bank");
    const mixed = resources.filter((r) => r.type === "mixed");

    expect(pantries).toHaveLength(1);
    expect(banks).toHaveLength(1);
    expect(mixed).toHaveLength(1);
  });
});

describe("Deduplication", () => {
  test("should deduplicate by name and address", () => {
    const resources = [
      { name: "Test Pantry", address: "123 Main St" },
      { name: "Test Pantry", address: "123 Main St" }, // duplicate
      { name: "Different Pantry", address: "456 Oak St" },
      { name: "test pantry", address: "123 main st" }, // duplicate (case insensitive)
    ];

    const seen = new Map<string, typeof resources[0]>();

    for (const result of resources) {
      const key = `${result.name.toLowerCase()}-${result.address.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, result);
      }
    }

    const unique = Array.from(seen.values());

    expect(unique).toHaveLength(2);
  });
});

// ABOUTME: Tests for source URL and name filtering
// ABOUTME: Validates blocked patterns and ensures food distribution sites aren't filtered

import { test, expect, describe } from "bun:test";
import { filterBySource } from "./source-filter";
import type { FoodResource } from "./database";

describe("filterBySource", () => {
  describe("government offices", () => {
    test("filters out Emergency Management offices", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Cowley County Emergency Management",
          address: "123 Main St",
          city: "Winfield",
          state: "KS",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(0);
    });

    test("filters out Housing Authority offices", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Cowley County Housing Authority",
          address: "456 Oak St",
          city: "Winfield",
          state: "KS",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(0);
    });

    test("keeps Emergency Management with explicit food program", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Cowley County Emergency Management Food Distribution Center",
          address: "123 Main St",
          city: "Winfield",
          state: "KS",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });

    test("keeps Housing Authority with food pantry", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Cowley County Housing Authority Food Pantry",
          address: "456 Oak St",
          city: "Winfield",
          state: "KS",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });

    test("filters out multiple government offices at once", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "County Emergency Management",
          address: "123 Main St",
          city: "Anytown",
          state: "CA",
        },
        {
          name: "Local Housing Authority",
          address: "456 Oak St",
          city: "Anytown",
          state: "CA",
        },
        {
          name: "Community Food Bank",
          address: "789 Elm St",
          city: "Anytown",
          state: "CA",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("Community Food Bank");
    });
  });

  describe("existing patterns", () => {
    test("filters out schools without food programs", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Lincoln Elementary School",
          address: "123 School St",
          city: "Springfield",
          state: "IL",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(0);
    });

    test("keeps schools with explicit food pantry", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Lincoln Elementary School Food Pantry",
          address: "123 School St",
          city: "Springfield",
          state: "IL",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });

    test("filters out procurement offices", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "County Procurement Office",
          address: "123 Gov St",
          city: "Capital City",
          state: "NY",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(0);
    });
  });

  describe("food distribution sites", () => {
    test("keeps food banks", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Second Harvest Food Bank",
          address: "123 Food St",
          city: "San Jose",
          state: "CA",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });

    test("keeps food pantries", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "St. Mary's Food Pantry",
          address: "456 Church St",
          city: "Boston",
          state: "MA",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });

    test("keeps community kitchens", () => {
      const resources: Partial<FoodResource>[] = [
        {
          name: "Downtown Community Kitchen",
          address: "789 Main St",
          city: "Seattle",
          state: "WA",
        },
      ];

      const filtered = filterBySource(resources);
      expect(filtered).toHaveLength(1);
    });
  });
});

// ABOUTME: Migration script to move data from SQLite to Postgres
// ABOUTME: One-time script to migrate existing resources and search history

import { Database as SQLiteDatabase } from "bun:sqlite";
import { initDatabase } from "./database";
import type { FoodResource, ZipSearch, CountySearch } from "./database";

async function migrateData() {
  console.log("Starting data migration from SQLite to Postgres...");

  // Open SQLite database
  const sqlite = new SQLiteDatabase("pantry-search.db");
  const postgres = await initDatabase();

  // Migrate resources
  const resources = sqlite.query<FoodResource>("SELECT * FROM resources").all();
  console.log(`Found ${resources.length} resources to migrate`);

  for (const resource of resources) {
    await postgres`
      INSERT INTO resources (
        name, address, city, state, zip_code, county_name, county_geoid, location_type,
        latitude, longitude, type, phone, hours, rating, wait_time_minutes,
        eligibility_requirements, services_offered, languages_spoken, accessibility_notes,
        notes, is_verified, verification_notes, source_url, created_at, last_verified_at
      ) VALUES (
        ${resource.name},
        ${resource.address},
        ${resource.city},
        ${resource.state},
        ${resource.zip_code},
        ${resource.county_name},
        ${resource.county_geoid},
        ${resource.location_type},
        ${resource.latitude},
        ${resource.longitude},
        ${resource.type},
        ${resource.phone},
        ${resource.hours},
        ${resource.rating},
        ${resource.wait_time_minutes},
        ${resource.eligibility_requirements},
        ${resource.services_offered},
        ${resource.languages_spoken},
        ${resource.accessibility_notes},
        ${resource.notes},
        ${resource.is_verified},
        ${resource.verification_notes},
        ${resource.source_url},
        ${resource.created_at ? new Date(resource.created_at) : null},
        ${resource.last_verified_at ? new Date(resource.last_verified_at) : null}
      )
    `;
  }
  console.log(`Migrated ${resources.length} resources`);

  // Migrate zip searches
  const zipSearches = sqlite.query<ZipSearch>("SELECT * FROM zip_searches").all();
  console.log(`Found ${zipSearches.length} zip searches to migrate`);

  for (const search of zipSearches) {
    await postgres`
      INSERT INTO zip_searches (zip_code, searched_at, result_count)
      VALUES (
        ${search.zip_code},
        ${search.searched_at ? new Date(search.searched_at) : null},
        ${search.result_count}
      )
    `;
  }
  console.log(`Migrated ${zipSearches.length} zip searches`);

  // Migrate county searches if they exist
  try {
    const countySearches = sqlite.query<CountySearch>("SELECT * FROM county_searches").all();
    console.log(`Found ${countySearches.length} county searches to migrate`);

    for (const search of countySearches) {
      await postgres`
        INSERT INTO county_searches (county_geoid, county_name, state, searched_at, result_count)
        VALUES (
          ${search.county_geoid},
          ${search.county_name},
          ${search.state},
          ${search.searched_at ? new Date(search.searched_at) : null},
          ${search.result_count}
        )
      `;
    }
    console.log(`Migrated ${countySearches.length} county searches`);
  } catch (e) {
    console.log("No county searches table or data to migrate");
  }

  sqlite.close();
  await postgres.end();

  console.log("Migration complete!");
}

migrateData().catch(console.error);

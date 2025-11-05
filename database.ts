// ABOUTME: Database schema and initialization for food pantry/bank resources
// ABOUTME: Handles Postgres setup with resource storage and zip code search tracking

import postgres from "postgres";

export interface FoodResource {
  id?: number;
  name: string;
  address: string;
  city?: string;
  state?: string;
  zip_code?: string;
  county_name?: string;
  county_geoid?: string;
  location_type?: "zip" | "county";
  latitude?: number;
  longitude?: number;
  type: "pantry" | "bank" | "mixed";
  phone?: string;
  hours?: string;
  rating?: number;
  wait_time_minutes?: number;
  eligibility_requirements?: string;
  services_offered?: string;
  languages_spoken?: string;
  accessibility_notes?: string;
  notes?: string;
  is_verified: boolean;
  verification_notes?: string;
  source_url?: string;
  created_at?: string;
  last_verified_at?: string;
  needs_enrichment?: boolean;
  google_place_id?: string;
  last_enrichment_attempt?: string;
  enrichment_failure_count?: number;
  enrichment_failure_reason?: string;
}

export interface ZipSearch {
  id?: number;
  zip_code: string;
  searched_at?: string;
  result_count: number;
}

export interface CountySearch {
  id?: number;
  county_geoid: string;
  county_name: string;
  state: string;
  searched_at?: string;
  result_count: number;
}

export type Database = ReturnType<typeof postgres>;

export async function initDatabase(): Promise<Database> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const sql = postgres(databaseUrl, {
    ssl: { rejectUnauthorized: false },
    onnotice: () => {} // Suppress NOTICE messages
  });

  // Create resources table
  await sql`
    CREATE TABLE IF NOT EXISTS resources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      county_name TEXT,
      county_geoid TEXT,
      location_type TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      type TEXT NOT NULL,
      phone TEXT,
      hours TEXT,
      rating DOUBLE PRECISION,
      wait_time_minutes INTEGER,
      eligibility_requirements TEXT,
      services_offered TEXT,
      languages_spoken TEXT,
      accessibility_notes TEXT,
      notes TEXT,
      is_verified BOOLEAN DEFAULT false,
      verification_notes TEXT,
      source_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_verified_at TIMESTAMP,
      needs_enrichment BOOLEAN DEFAULT false,
      google_place_id TEXT,
      last_enrichment_attempt TIMESTAMP,
      enrichment_failure_count INTEGER DEFAULT 0,
      enrichment_failure_reason TEXT
    )
  `;

  // Create zip searches tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS zip_searches (
      id SERIAL PRIMARY KEY,
      zip_code TEXT NOT NULL,
      searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      result_count INTEGER
    )
  `;

  // Create county searches tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS county_searches (
      id SERIAL PRIMARY KEY,
      county_geoid TEXT NOT NULL,
      county_name TEXT NOT NULL,
      state TEXT NOT NULL,
      searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      result_count INTEGER
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_zip_code ON resources(zip_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_county_geoid ON resources(county_geoid)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_location ON resources(latitude, longitude)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_location_type ON resources(location_type)`;

  return sql;
}

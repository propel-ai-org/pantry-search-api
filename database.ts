// ABOUTME: Database schema and initialization for food pantry/bank resources
// ABOUTME: Handles SQLite setup with resource storage and zip code search tracking

import { Database } from "bun:sqlite";

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

export function initDatabase(): Database {
  const db = new Database("pantry-search.db");

  // Create resources table
  db.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      county_name TEXT,
      county_geoid TEXT,
      location_type TEXT,
      latitude REAL,
      longitude REAL,
      type TEXT NOT NULL,
      phone TEXT,
      hours TEXT,
      rating REAL,
      wait_time_minutes INTEGER,
      eligibility_requirements TEXT,
      services_offered TEXT,
      languages_spoken TEXT,
      accessibility_notes TEXT,
      notes TEXT,
      is_verified INTEGER DEFAULT 0,
      verification_notes TEXT,
      source_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_verified_at DATETIME
    )
  `);

  // Create zip searches tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS zip_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zip_code TEXT NOT NULL,
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      result_count INTEGER
    )
  `);

  // Create county searches tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS county_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      county_geoid TEXT NOT NULL,
      county_name TEXT NOT NULL,
      state TEXT NOT NULL,
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      result_count INTEGER
    )
  `);

  // Add new columns if they don't exist (migration)
  const newColumns = [
    'county_name TEXT',
    'county_geoid TEXT',
    'location_type TEXT',
    'rating REAL',
    'wait_time_minutes INTEGER',
    'eligibility_requirements TEXT',
    'services_offered TEXT',
    'languages_spoken TEXT',
    'accessibility_notes TEXT'
  ];

  for (const column of newColumns) {
    try {
      db.run(`ALTER TABLE resources ADD COLUMN ${column}`);
    } catch (e) {
      // Column already exists
    }
  }

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_zip_code ON resources(zip_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_county_geoid ON resources(county_geoid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_location ON resources(latitude, longitude)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_location_type ON resources(location_type)`);

  return db;
}

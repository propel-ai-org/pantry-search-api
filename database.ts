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
  latitude?: number;
  longitude?: number;
  type: "pantry" | "bank" | "mixed";
  phone?: string;
  hours?: string;
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

  // Create zip searches tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS zip_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zip_code TEXT NOT NULL,
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      result_count INTEGER
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_zip_code ON resources(zip_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_location ON resources(latitude, longitude)`);

  return db;
}

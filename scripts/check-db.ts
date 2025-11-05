// ABOUTME: Quick script to check database table counts
// ABOUTME: Shows how many records are in each table

import { initDatabase } from "../src/database";

const db = await initDatabase();

const resources = await db`SELECT COUNT(*) as count FROM resources`;
const counties = await db`SELECT COUNT(*) as count FROM county_searches`;
const zips = await db`SELECT COUNT(*) as count FROM zip_searches`;

console.log("Resources:", resources[0].count);
console.log("County searches:", counties[0].count);
console.log("Zip searches:", zips[0].count);

await db.end();

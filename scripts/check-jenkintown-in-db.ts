// Check if Jenkintown Food Cupboard is in the database

import { initDatabase } from "../src/database";

const db = await initDatabase();

const jenkintown = await db`SELECT * FROM resources WHERE name LIKE '%Jenkintown%'`;

if (jenkintown.length > 0) {
  console.log("✅ Jenkintown Food Cupboard IS in the database:");
  console.log(JSON.stringify(jenkintown, null, 2));
} else {
  console.log("❌ Jenkintown Food Cupboard is NOT in the database");
}

process.exit(0);

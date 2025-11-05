// Clear cache for Montgomery County, PA to allow fresh testing

import { initDatabase } from "../src/database";

const db = await initDatabase();

// Clear Montgomery County cache
await db`DELETE FROM county_searches WHERE county_name = 'Montgomery County' AND state = 'PA'`;
await db`DELETE FROM resources WHERE county_name = 'Montgomery County' AND state = 'PA'`;

console.log("✅ Cache cleared for Montgomery County, PA");
process.exit(0);

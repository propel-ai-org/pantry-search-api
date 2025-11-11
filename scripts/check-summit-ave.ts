// Check for resources with Summit Ave address

import { initDatabase } from "../src/core/database";

const db = await initDatabase();

const all = await db`SELECT name, address, city, state FROM resources WHERE address LIKE '%Summit%' OR address LIKE '%summit%'`;

console.log(`Found ${all.length} resources with 'Summit' in address:\n`);
console.log(JSON.stringify(all, null, 2));

process.exit(0);

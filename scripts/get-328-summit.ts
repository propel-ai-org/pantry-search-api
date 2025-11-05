// Get full details of 328 Summit Ave entry

import { initDatabase } from "../src/database";

const db = await initDatabase();

const entry = await db`SELECT * FROM resources WHERE address = '328 Summit Ave'`;

console.log(JSON.stringify(entry, null, 2));

process.exit(0);

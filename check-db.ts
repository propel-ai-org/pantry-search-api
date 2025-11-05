import { initDatabase } from "./src/database";

const db = await initDatabase();

const resources = await db`
  SELECT name, url_facebook, url_twitter, url_instagram, url_youtube
  FROM resources
  WHERE url_facebook IS NOT NULL OR url_twitter IS NOT NULL OR url_instagram IS NOT NULL OR url_youtube IS NOT NULL
  LIMIT 10
`;

console.log(`Found ${resources.length} resources with social media links:\n`);
for (const r of resources) {
  console.log(`${r.name}:`);
  if (r.url_facebook) console.log(`  Facebook: ${r.url_facebook}`);
  if (r.url_twitter) console.log(`  Twitter: ${r.url_twitter}`);
  if (r.url_instagram) console.log(`  Instagram: ${r.url_instagram}`);
  if (r.url_youtube) console.log(`  YouTube: ${r.url_youtube}`);
  console.log();
}

await db.end();

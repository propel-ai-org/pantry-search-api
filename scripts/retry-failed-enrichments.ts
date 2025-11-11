// ABOUTME: Retry enrichment for resources that failed due to API key issues
// ABOUTME: Resets enrichment status to allow the background worker to retry

import { initDatabase } from "../src/core/database";

async function retryFailedEnrichments() {
  const db = await initDatabase();

  console.log("Finding resources that failed enrichment due to API key...");

  // Find all resources with API key failure
  const failedResources = await db<Array<{ id: number; name: string; enrichment_failure_reason: string }>>`
    SELECT id, name, enrichment_failure_reason
    FROM resources
    WHERE enrichment_failure_reason = 'API key not configured'
  `;

  console.log(`Found ${failedResources.length} resources to retry`);

  if (failedResources.length === 0) {
    console.log("No resources need retrying!");
    await db.end();
    return;
  }

  // Reset their enrichment status
  const result = await db`
    UPDATE resources
    SET
      needs_enrichment = true,
      enrichment_failure_reason = NULL,
      enrichment_failure_count = 0,
      last_enrichment_attempt = NULL
    WHERE enrichment_failure_reason = 'API key not configured'
  `;

  console.log(`✅ Reset ${result.count} resources for re-enrichment`);
  console.log("The background enrichment worker will automatically process these resources.");

  await db.end();
}

retryFailedEnrichments().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

// ABOUTME: Test script for Jina search functionality
// ABOUTME: Verifies that Jina API integration works and extracts food resources correctly

import { searchWithJina } from "../src/search/jina-search";

async function main() {
  const args = process.argv.slice(2);
  const location = args[0] || "94612";
  const locationType = (args[1] as "zip" | "county") || "zip";

  if (!process.env.JINA_API_KEY) {
    console.error("Warning: JINA_API_KEY environment variable not set");
    console.log("Continuing without authentication (may have rate limits)\n");
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log(`Testing Jina search for ${locationType}: ${location}\n`);
  console.log("=".repeat(80));

  try {
    const results = await searchWithJina(location, locationType);

    console.log("\n" + "=".repeat(80));
    console.log(`\nFound ${results.length} resources:\n`);

    results.forEach((resource, index) => {
      console.log(`${index + 1}. ${resource.name}`);
      console.log(`   Address: ${resource.address}`);
      if (resource.city && resource.state) {
        console.log(`   Location: ${resource.city}, ${resource.state}`);
      }
      console.log(`   Type: ${resource.type}`);
      if (resource.phone) {
        console.log(`   Phone: ${resource.phone}`);
      }
      if (resource.hours) {
        console.log(`   Hours: ${resource.hours}`);
      }
      if (resource.source_url) {
        console.log(`   Source: ${resource.source_url}`);
      }
      console.log();
    });

    console.log("=".repeat(80));
    console.log(`\nTest completed successfully!`);
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("\nTest failed:");
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);

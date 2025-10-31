// ABOUTME: Source URL filtering to exclude unreliable or inappropriate domains
// ABOUTME: Maintains list of blocked domains and filters search results

import type { FoodResource } from "./database";

// Domains to exclude from search results
const BLOCKED_DOMAINS = [
  "nextdoor.com",
  "facebook.com",
  "fb.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "yelp.com", // User reviews can be unreliable for verification
];

export function filterBySource(
  resources: Partial<FoodResource>[]
): Partial<FoodResource>[] {
  return resources.filter((resource) => {
    if (!resource.source_url) {
      // Keep resources without source URLs
      return true;
    }

    try {
      const url = new URL(resource.source_url);
      const hostname = url.hostname.toLowerCase();

      // Check if hostname matches any blocked domain
      for (const blocked of BLOCKED_DOMAINS) {
        if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
          console.log(
            `Filtering out ${resource.name} from blocked source: ${hostname}`
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      // Invalid URL, filter it out
      console.log(`Filtering out ${resource.name} with invalid URL: ${resource.source_url}`);
      return false;
    }
  });
}

export function getBlockedDomains(): string[] {
  return [...BLOCKED_DOMAINS];
}

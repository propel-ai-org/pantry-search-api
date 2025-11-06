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

// Name patterns that indicate non-food-assistance locations
const BLOCKED_NAME_PATTERNS = [
  // Directory/listing pages (these should not be stored as individual resources)
  /\b(food\s+)?assistance\s+director(y|ies)\b/i,
  /\bfood\s+bank\s+director(y|ies)\b/i,
  /\bfood\s+pantry\s+director(y|ies)\b/i,
  /\bresource\s+director(y|ies)\b/i,
  /\b(food\s+)?resources?\s+list(ing)?s?\b/i,
  /\bfood\s+locator\b/i,
  /\bfood\s+finder\b/i,
  /\bmember\s+(organizations?|agencies)\b(?!.*\b(food pantry|food bank)\b)/i,
  /\bpartner\s+(organizations?|agencies)\b(?!.*\b(food pantry|food bank)\b)/i,

  // Schools (unless name explicitly mentions food pantry/bank)
  /\b(elementary|middle|high|junior high|senior high)\s+school\b(?!.*\b(food pantry|food bank|pantry)\b)/i,
  /\b(university|college)\b(?!.*\b(food pantry|food bank|pantry)\b)/i,
  /\bschool\b(?!.*\b(food pantry|food bank|pantry)\b)/i,

  // Commercial businesses
  /\b(meal prep|restaurant|cafe|grocery|market|store)\b/i,

  // Law enforcement (not food distribution sites)
  /\bsheriff'?s?\s+(office|department|dept)\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\bpolice\s+(department|dept|station|office)\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\blaw\s+enforcement\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\bcorrections\s+(department|facility|office)\b/i,
  /\bjail\b(?!.*\b(food|pantry|bank)\b)/i,
  /\bdetention\s+center\b(?!.*\b(food|pantry|bank)\b)/i,

  // Government offices (unless explicitly food distribution/pantry/bank)
  /\b(city hall|county office|dmv|department of)\b(?!.*\b(food|nutrition|wic|pantry|bank)\b)/i,
  /\b(borough office|municipal office)\b(?!.*\b(food|pantry|bank|distribution)\b)/i,
  /\b(procurement|public works|administration)\b(?!.*\b(food|pantry|bank|nutrition|wic|meal|feeding)\b)/i,
  /\b(senior citizen center|senior services)\b(?!.*\b(food|pantry|bank|meal|nutrition)\b)/i,
  /\b(emergency management|housing authority)\b(?!.*\b(food|pantry|bank|nutrition|wic|meal|feeding|distribution)\b)/i,

  // National umbrella organizations (not actual distribution sites)
  /^feeding america$/i,
  /^feedingamerica$/i,
];

// URL patterns that indicate general government sites (not food-specific)
const BLOCKED_URL_PATTERNS = [
  // Directory/listing page URL patterns
  /\/(directory|directories)\b/i,
  /\/(list|listing|listings)\b/i,
  /\/(locator|finder)\b(?!.*\b(pantry|bank)\b)/i,
  /\/(resources|members|partners|organizations)\b(?!.*\b(pantry|bank|food)\b)/i,

  // Only filter .gov domains at root level - they're more likely to be generic government sites
  /\.gov$/i, // Root .gov domain without specific page
  /\.gov\/?$/i,
  // Filter generic pages on .gov domains
  /\.gov\/(about|contact|home|index)\/?$/i,
];

export function filterBySource(
  resources: Partial<FoodResource>[]
): Partial<FoodResource>[] {
  return resources.filter((resource) => {
    // Check name patterns first
    if (resource.name) {
      for (const pattern of BLOCKED_NAME_PATTERNS) {
        if (pattern.test(resource.name)) {
          console.log(
            `Filtering out ${resource.name} - matches blocked pattern`
          );
          return false;
        }
      }
    }

    // Then check source URL
    if (!resource.source_url) {
      // Keep resources without source URLs
      return true;
    }

    try {
      const url = new URL(resource.source_url);
      const hostname = url.hostname.toLowerCase();
      const fullUrl = resource.source_url.toLowerCase();

      // Check if hostname matches any blocked domain
      for (const blocked of BLOCKED_DOMAINS) {
        if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
          console.log(
            `Filtering out ${resource.name} from blocked source: ${hostname}`
          );
          return false;
        }
      }

      // Check URL patterns - filter generic government/org pages unless they have food-specific paths
      for (const pattern of BLOCKED_URL_PATTERNS) {
        if (pattern.test(fullUrl)) {
          // Allow if the URL contains food-related keywords in the path
          const hasFoodPath = /\/(food|pantry|bank|nutrition|wic|snap|assistance|feeding)/i.test(url.pathname);
          if (!hasFoodPath) {
            console.log(
              `Filtering out ${resource.name} - generic government/org URL without food-specific path: ${resource.source_url}`
            );
            return false;
          }
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

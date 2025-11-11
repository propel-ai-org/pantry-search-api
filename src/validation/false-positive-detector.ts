// ABOUTME: False positive detection for food resource listings
// ABOUTME: Identifies likely non-food-assistance locations through pattern matching and scoring

import type { FoodResource } from "../core/database";

export interface SuspicionScore {
  score: number; // 0-100, higher = more suspicious
  reasons: string[];
  category: "financial_bank" | "wrong_bank_type" | "government_office" | "community_center" | "school" | "missing_verification" | "generic_listing" | "directory_page" | "unclear";
}

export interface AnalyzedResource extends FoodResource {
  suspicion: SuspicionScore;
}

// Financial institution patterns (these are NOT food banks)
const FINANCIAL_PATTERNS = [
  /\b(atm|credit union|savings|loan|mortgage|investment|checking account)\b/i,
  /\b(wells fargo|chase|bank of america|citibank|us bank|pnc bank|td bank|capital one)\b/i,
  /\bfederal reserve\b/i,
  /\bbanking center\b/i,
  /\b(branch|atm) location\b/i,
];

// Wrong type of bank patterns
const WRONG_BANK_PATTERNS = [
  /\bblood bank\b/i,
  /\bmilk bank\b/i,
  /\btissue bank\b/i,
  /\beye bank\b/i,
  /\borgan bank\b/i,
  /\bseed bank\b/i,
  /\bgene bank\b/i,
  /\bsperm bank\b/i,
];

// Government office patterns (not food distribution)
const GOVERNMENT_OFFICE_PATTERNS = [
  /\b(department of|dept of|division of)\b(?!.*\b(food|nutrition|agriculture|health|human services|social services)\b)/i,
  /\b(city hall|town hall|county clerk|registrar)\b/i,
  /\b(tax office|revenue|treasury|finance department)\b/i,
  /\b(planning commission|zoning|building department)\b/i,
  /\b(public works|sanitation|utilities)\b/i,
];

// Law enforcement patterns (not food distribution sites)
const LAW_ENFORCEMENT_PATTERNS = [
  /\bsheriff'?s?\s+(office|department|dept)\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\bpolice\s+(department|dept|station|office)\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\blaw\s+enforcement\b(?!.*\b(food|pantry|bank|donation|feeding)\b)/i,
  /\bcorrections\s+(department|facility|office)\b/i,
  /\bjail\b(?!.*\b(food|pantry|bank)\b)/i,
  /\bdetention\s+center\b(?!.*\b(food|pantry|bank)\b)/i,
];

// Community centers/churches without food services
const GENERIC_COMMUNITY_PATTERNS = [
  /\bcommunity center\b(?!.*\b(food|pantry|bank|meal|nutrition|feeding)\b)/i,
  /\b(church|cathedral|temple|mosque|synagogue)\b(?!.*\b(food|pantry|bank|meal|feeding|distribution)\b)/i,
  /\brec center\b(?!.*\b(food|pantry|meal)\b)/i,
  /\byouth center\b(?!.*\b(food|pantry|meal)\b)/i,
];

// School patterns (should be caught earlier, but double-check)
const SCHOOL_PATTERNS = [
  /\b(elementary|middle|high school|university|college)\b(?!.*\b(food pantry|food bank)\b)/i,
];

// Generic/vague names that need verification
const GENERIC_NAME_PATTERNS = [
  /^food bank$/i, // Just "Food Bank" with no location
  /^pantry$/i, // Just "Pantry"
  /^community food$/i,
  /^free food$/i,
];

// Directory/listing page patterns
const DIRECTORY_NAME_PATTERNS = [
  /\b(food\s+)?assistance\s+director(y|ies)\b/i,
  /\bfood\s+bank\s+director(y|ies)\b/i,
  /\bfood\s+pantry\s+director(y|ies)\b/i,
  /\bdirector(y|ies)\b(?!.*\b(director|executive)\b)/i, // "Directory" but not job titles
  /\bresource\s+director(y|ies)\b/i,
  /\b(food\s+)?resources?\s+list(ing)?s?\b/i,
  /\bfood\s+locator\b/i,
  /\bfind\s+food\b(?!.*\b(pantry|bank)\b)/i, // "Find Food" pages unless they're a specific pantry/bank
  /\bfood\s+finder\b/i,
  /\bmember\s+(organizations?|agencies)\b/i,
  /\bpartner\s+(organizations?|agencies)\b/i,
];

// URL path patterns indicating directory pages
const DIRECTORY_URL_PATTERNS = [
  /\/(directory|directories)\b/i,
  /\/(list|listing|listings)\b/i,
  /\/(locator|finder)\b/i,
  /\/(resources|assistance)\b(?!.*\/(pantry|bank|food)\b)/i,
  /\/(find-food|food-finder)\b/i,
  /\/(members|partners|organizations)\b/i,
];

// Positive indicators (these reduce suspicion)
const FOOD_ASSISTANCE_INDICATORS = [
  /\bfood pantry\b/i,
  /\bfood bank\b/i,
  /\bfood distribution\b/i,
  /\bfeeding america\b/i,
  /\bemergency food\b/i,
  /\bfood shelf\b/i,
  /\bfood ministry\b/i,
  /\bfood cupboard\b/i,
  /\bfood closet\b/i,
  /\bsoup kitchen\b/i,
  /\bmeal program\b/i,
  /\bfeeding program\b/i,
  /\bnutrition program\b/i,
  /\bharvest\b.*\b(food|pantry)\b/i,
];

export function analyzeResource(resource: FoodResource): SuspicionScore {
  let score = 0;
  const reasons: string[] = [];
  let category: SuspicionScore["category"] = "unclear";

  const name = resource.name || "";
  const notes = resource.notes || "";
  const verificationNotes = resource.verification_notes || "";
  const sourceUrl = resource.source_url || "";
  const searchText = `${name} ${notes} ${verificationNotes}`.toLowerCase();

  // Check for directory pages FIRST (highest priority)
  for (const pattern of DIRECTORY_NAME_PATTERNS) {
    if (pattern.test(name)) {
      score += 85;
      reasons.push("Name indicates this is a directory/listing page, not an actual location");
      category = "directory_page";
      break;
    }
  }

  // Also check URL patterns for directories
  if (sourceUrl && category !== "directory_page") {
    for (const pattern of DIRECTORY_URL_PATTERNS) {
      if (pattern.test(sourceUrl)) {
        score += 75;
        reasons.push("URL path suggests this is a directory/listing page");
        category = "directory_page";
        break;
      }
    }
  }

  // Check for positive food assistance indicators first
  let hasPositiveIndicator = false;
  for (const pattern of FOOD_ASSISTANCE_INDICATORS) {
    if (pattern.test(searchText)) {
      hasPositiveIndicator = true;
      break;
    }
  }

  // Financial institution check (HIGH PRIORITY for "bank" type)
  if (resource.type === "bank") {
    for (const pattern of FINANCIAL_PATTERNS) {
      if (pattern.test(searchText)) {
        score += 80;
        reasons.push("Contains financial institution keywords");
        category = "financial_bank";
        break;
      }
    }

    // If it's a "bank" type but has no positive food indicators, it's suspicious
    if (!hasPositiveIndicator && category === "unclear") {
      score += 40;
      reasons.push("Type 'bank' but no clear food assistance indicators");
      category = "financial_bank";
    }
  }

  // Wrong type of bank
  for (const pattern of WRONG_BANK_PATTERNS) {
    if (pattern.test(searchText)) {
      score += 90;
      reasons.push("Not a food bank (blood bank, milk bank, etc.)");
      category = "wrong_bank_type";
      break;
    }
  }

  // Law enforcement check (very high priority)
  for (const pattern of LAW_ENFORCEMENT_PATTERNS) {
    if (pattern.test(searchText)) {
      score += 90;
      reasons.push("Law enforcement facility, not a food distribution site");
      category = "government_office";
      break;
    }
  }

  // Government office check
  for (const pattern of GOVERNMENT_OFFICE_PATTERNS) {
    if (pattern.test(searchText)) {
      score += 60;
      reasons.push("Appears to be government office, not food distribution site");
      category = "government_office";
      break;
    }
  }

  // Generic community center/church
  for (const pattern of GENERIC_COMMUNITY_PATTERNS) {
    if (pattern.test(searchText)) {
      score += 50;
      reasons.push("Generic community center/church without food service indicators");
      category = "community_center";
      break;
    }
  }

  // School check
  for (const pattern of SCHOOL_PATTERNS) {
    if (pattern.test(searchText)) {
      score += 70;
      reasons.push("Appears to be a school without dedicated food pantry");
      category = "school";
      break;
    }
  }

  // Generic name check
  for (const pattern of GENERIC_NAME_PATTERNS) {
    if (pattern.test(name)) {
      score += 30;
      reasons.push("Very generic name, needs verification");
      if (category === "unclear") {
        category = "generic_listing";
      }
      break;
    }
  }

  // Verification status check
  if (!resource.is_verified) {
    score += 20;
    reasons.push("Not verified");
    if (category === "unclear") {
      category = "missing_verification";
    }
  }

  // Missing critical information
  if (!resource.phone && !resource.hours && !resource.source_url) {
    score += 30;
    reasons.push("Missing contact information (phone, hours, source URL)");
  }

  // Weak verification notes
  if (resource.verification_notes && resource.verification_notes.length < 20) {
    score += 15;
    reasons.push("Very brief verification notes");
  }

  // If no Google Place ID and needs enrichment
  if (!resource.google_place_id && resource.needs_enrichment) {
    score += 10;
    reasons.push("Needs Google Places enrichment");
  }

  // Permanently or temporarily closed
  if (resource.enrichment_failure_reason) {
    if (resource.enrichment_failure_reason.toLowerCase().includes("permanently closed")) {
      score += 100;
      reasons.push("Marked as permanently closed");
      if (category === "unclear") {
        category = "generic_listing";
      }
    } else if (resource.enrichment_failure_reason.toLowerCase().includes("temporarily closed")) {
      score += 50;
      reasons.push("Marked as temporarily closed");
    }
  }

  // Enrichment failures
  if (resource.enrichment_failure_count && resource.enrichment_failure_count > 2) {
    score += 25;
    reasons.push(`Failed enrichment ${resource.enrichment_failure_count} times`);
  }

  // REDUCTION: If we found positive indicators, reduce score
  if (hasPositiveIndicator) {
    score = Math.max(0, score - 40);
    if (score < 30) {
      reasons.push("Has clear food assistance indicators");
    }
  }

  // Cap score at 100
  score = Math.min(100, score);

  return {
    score,
    reasons,
    category,
  };
}

export function analyzeResources(resources: FoodResource[]): AnalyzedResource[] {
  return resources.map(resource => ({
    ...resource,
    suspicion: analyzeResource(resource),
  }));
}

export function filterBySuspicion(
  resources: AnalyzedResource[],
  minScore: number = 50
): AnalyzedResource[] {
  return resources.filter(r => r.suspicion.score >= minScore);
}

export function groupByCategory(resources: AnalyzedResource[]): Record<string, AnalyzedResource[]> {
  const grouped: Record<string, AnalyzedResource[]> = {};

  for (const resource of resources) {
    const category = resource.suspicion.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(resource);
  }

  return grouped;
}

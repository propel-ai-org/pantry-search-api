// ABOUTME: Jina AI Search API integration for finding food resources
// ABOUTME: Uses Jina's search API to find food pantries/banks and extract structured data

import OpenAI from "openai";
import type { FoodResource } from "./database";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface JinaSearchResult {
  title: string;
  url: string;
  description: string;
  content: string;
  metadata?: Record<string, any>;
}

interface JinaSearchResponse {
  code: number;
  status: number;
  data: JinaSearchResult[];
}

interface ExtractedResource {
  name: string;
  address: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  type: "pantry" | "bank" | "mixed";
  phone?: string;
  hours?: string;
  rating?: number;
  wait_time_minutes?: number;
  eligibility_requirements?: string;
  services_offered?: string;
  languages_spoken?: string;
  accessibility_notes?: string;
  notes?: string;
  is_verified: boolean;
  verification_notes?: string;
  source_url: string;
}


async function fetchJinaSearchResults(
  query: string,
  countryCode: string = "US",
  maxResults: number = 20
): Promise<JinaSearchResult[]> {
  try {
    const allResults: JinaSearchResult[] = [];

    // Jina Search API returns ~10 results per request
    // We'll make multiple requests with different page parameters to get more results
    const requestsNeeded = Math.ceil(maxResults / 10);
    console.log(`Fetching up to ${maxResults} Jina search results for: ${query}`);

    for (let page = 0; page < requestsNeeded; page++) {
      const url = new URL("https://s.jina.ai/");
      url.searchParams.set("q", query);
      url.searchParams.set("gl", countryCode);

      // Add page/offset parameter if supported by Jina
      if (page > 0) {
        url.searchParams.set("start", String(page * 10));
      }

      const headers: Record<string, string> = {
        "Accept": "application/json",
        "X-Engine": "direct",
        "X-Retain-Images": "none",
        "X-With-Links-Summary": "true",
      };

      if (process.env.JINA_API_KEY) {
        headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      }

      console.log(`  Fetching page ${page + 1}/${requestsNeeded}...`);
      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        console.warn(`Jina API returned ${response.status} for page ${page + 1}, stopping pagination`);
        break;
      }

      const data = await response.json() as JinaSearchResponse;

      if (!data.data || !Array.isArray(data.data)) {
        console.warn(`Invalid response format from Jina for page ${page + 1}, stopping pagination`);
        break;
      }

      console.log(`  Got ${data.data.length} results from page ${page + 1}`);

      // If we got fewer results than expected, we've reached the end
      if (data.data.length === 0) {
        console.log(`  No more results available, stopping pagination`);
        break;
      }

      allResults.push(...data.data);

      // Small delay between requests to be respectful to the API
      if (page < requestsNeeded - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Total: ${allResults.length} search results from Jina`);
    return allResults;
  } catch (error) {
    console.error("Error fetching from Jina:", error);
    throw new Error(
      `Failed to fetch from Jina: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function extractDataFromSearchResult(
  searchResult: JinaSearchResult,
  location: string
): Promise<ExtractedResource | null> {
  try {
    const prompt = `You are extracting information about a food pantry or food bank from a search result.

Search Result:
Title: ${searchResult.title}
URL: ${searchResult.url}
Description: ${searchResult.description}

Content:
${searchResult.content.substring(0, 8000)}

Location context: ${location}

Analyze this content and extract information about food pantries or food banks mentioned on this page.

CRITICAL GEOGRAPHIC FILTERING:
- The resource MUST be physically located in ${location}
- Check the CITY in the address - it must be within ${location}
- REJECT organizations that "serve" or "cover" ${location} but are located in a different city/county
- REJECT regional/state-level food banks located in major cities (like Anchorage, Fairbanks) unless specifically searching for that city
- Example: If searching "Dillingham Census Area, AK", reject "Food Bank of Alaska" in Anchorage even if it serves Dillingham

IMPORTANT - DO NOT INCLUDE:
- National umbrella organizations (e.g., "Feeding America" national headquarters, state associations, regional networks)
- Regional food banks located in a different county/city (even if they serve the search area)
- Schools (elementary, middle, high schools, universities) unless they explicitly operate a food pantry as a separate service
- Churches/places of worship unless they explicitly operate a food pantry (not just host food distribution events)
- Commercial businesses (meal prep services, grocery stores, restaurants)
- Government offices unless they are specifically food distribution sites
- Community centers unless they explicitly operate a food pantry
- Directory pages that list multiple organizations (we need individual resources only)
- Locations whose address is in a different city/county than the search location

ONLY extract information if:
1. This page describes a SINGLE food pantry or food bank (not a directory)
2. The location's PRIMARY or MAJOR purpose is providing free food assistance
3. The resource is PHYSICALLY LOCATED in ${location} (verify the city in the address)

If this is a directory page, regional organization, or the address is in a different city, return null for all fields except is_verified (false) and verification_notes (explaining why).

Extract these fields ONLY if you have concrete evidence:
- name: Official name (REQUIRED if valid resource)
- address: Street address (REQUIRED if valid resource)
- city: City name
- state: State abbreviation (2 letters)
- type: "pantry" (emergency food distribution), "bank" (large-scale hub), or "mixed" (REQUIRED if valid resource)
- phone: Phone number in format (XXX) XXX-XXXX (only if found)
- hours: Operating hours (only if found, use exact format from source)
- eligibility_requirements: Who can receive services (only if stated)
- services_offered: What they provide beyond food (only if stated)
- languages_spoken: Languages available (only if stated)
- accessibility_notes: Wheelchair access, parking, etc. (only if mentioned)
- notes: Any other relevant information (brief, factual only)
- is_verified: true if this is a valid food resource in the search area, false otherwise
- verification_notes: How you verified it (e.g., "Official food bank website" or "Directory page, not a single resource")

CRITICAL:
- Do NOT make up or estimate any data
- If information is not clearly present, omit that field
- Use the source URL: ${searchResult.url}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 1000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "food_resource_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: {
                type: ["string", "null"],
                description: "Name of the food resource, or null if not a valid resource",
              },
              address: {
                type: ["string", "null"],
                description: "Street address, or null if not found",
              },
              city: {
                type: ["string", "null"],
                description: "City name, or null if not found",
              },
              state: {
                type: ["string", "null"],
                description: "State abbreviation (2 letters), or null if not found",
              },
              type: {
                type: ["string", "null"],
                enum: ["pantry", "bank", "mixed", null],
                description: "Type of resource, or null if not a valid resource",
              },
              phone: {
                type: ["string", "null"],
                description: "Phone number, or null if not found",
              },
              hours: {
                type: ["string", "null"],
                description: "Operating hours, or null if not found",
              },
              eligibility_requirements: {
                type: ["string", "null"],
                description: "Eligibility requirements, or null if not found",
              },
              services_offered: {
                type: ["string", "null"],
                description: "Services offered, or null if not found",
              },
              languages_spoken: {
                type: ["string", "null"],
                description: "Languages spoken, or null if not found",
              },
              accessibility_notes: {
                type: ["string", "null"],
                description: "Accessibility information, or null if not found",
              },
              notes: {
                type: ["string", "null"],
                description: "Additional notes, or null if none",
              },
              is_verified: {
                type: "boolean",
                description: "Whether this is a valid food resource",
              },
              verification_notes: {
                type: "string",
                description: "How the resource was verified or why it was rejected",
              },
            },
            required: [
              "name",
              "address",
              "city",
              "state",
              "type",
              "phone",
              "hours",
              "eligibility_requirements",
              "services_offered",
              "languages_spoken",
              "accessibility_notes",
              "notes",
              "is_verified",
              "verification_notes",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.log(`  No content returned for ${searchResult.url}`);
      return null;
    }

    const extracted = JSON.parse(content);

    // If not verified or missing required fields, skip
    if (!extracted.is_verified || !extracted.name || !extracted.address || !extracted.type) {
      console.log(`  Skipping ${searchResult.url}: ${extracted.verification_notes}`);
      return null;
    }

    return {
      ...extracted,
      source_url: searchResult.url,
    };
  } catch (error) {
    console.error(`Error extracting data from ${searchResult.url}:`, error);
    return null;
  }
}

export async function searchWithJina(
  location: string,
  locationType: "zip" | "county" = "zip"
): Promise<Partial<FoodResource>[]> {
  try {
    const locationPhrase =
      locationType === "zip"
        ? `near zip code ${location}`
        : `in ${location}`;

    const query = `Food pantries and food banks ${locationPhrase}`;

    // Fetch search results from Jina
    const searchResults = await fetchJinaSearchResults(query);

    if (searchResults.length === 0) {
      console.log("No search results from Jina");
      return [];
    }

    // Extract data from each search result directly
    console.log(`Extracting data from ${searchResults.length} search results...`);
    const extractionPromises = searchResults.map((result) =>
      extractDataFromSearchResult(result, location)
    );

    const extractedResources = await Promise.all(extractionPromises);

    // Filter out nulls
    const allResources = extractedResources.filter(
      (resource): resource is ExtractedResource => resource !== null
    );

    console.log(`Extracted ${allResources.length} valid resources from search results`);

    // Additional geographic filtering for county searches
    let geoFilteredResources = allResources;
    if (locationType === "county") {
      // Extract expected city name from county (e.g., "Dillingham Census Area" -> "Dillingham")
      const countyParts = location.split(/\s+(County|Census Area|Borough|Parish)/i);
      const expectedCity = countyParts[0].trim();

      // Major cities to reject when searching other counties (state capitals, major metros)
      const majorCitiesToReject = new Set([
        "anchorage", "fairbanks", "juneau", // Alaska
        "los angeles", "san francisco", "san diego", "sacramento", // California
        "new york", "brooklyn", "queens", "manhattan", // New York
        "chicago", // Illinois
        "houston", "dallas", "austin", "san antonio", // Texas
        "phoenix", "tucson", // Arizona
        "philadelphia", // Pennsylvania
        "seattle", "spokane", // Washington
        // Add more as needed
      ]);

      geoFilteredResources = allResources.filter((resource) => {
        const resourceCity = resource.city?.toLowerCase().trim();

        if (!resourceCity) {
          console.log(`  No city found for ${resource.name}, keeping it`);
          return true; // Keep if no city specified
        }

        // Reject if it's a major city and we're not searching for that city
        if (majorCitiesToReject.has(resourceCity) && !expectedCity.toLowerCase().includes(resourceCity)) {
          console.log(`  Filtered out ${resource.name} - located in major city ${resource.city} outside search area`);
          return false;
        }

        return true;
      });

      console.log(`After geographic filtering: ${geoFilteredResources.length} resources (${allResources.length - geoFilteredResources.length} filtered)`);
    }

    // Deduplicate by URL (case-insensitive)
    const seenUrls = new Set<string>();
    const dedupedResources = geoFilteredResources.filter((resource) => {
      const normalizedUrl = resource.source_url.toLowerCase().trim();
      if (seenUrls.has(normalizedUrl)) {
        console.log(`  Duplicate URL skipped: ${resource.source_url}`);
        return false;
      }
      seenUrls.add(normalizedUrl);
      return true;
    });

    console.log(`After deduplication: ${dedupedResources.length} unique resources`);

    return dedupedResources;
  } catch (error) {
    console.error("Jina search error:", error);
    throw new Error(
      `Failed to search with Jina: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ABOUTME: OpenAI API integration with web search for finding food resources
// ABOUTME: Uses GPT-4 with web search to find and verify food pantries/banks

import OpenAI from "openai";
import type { FoodResource } from "../core/database";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface OpenAISearchResult {
  resources: Array<{
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
    source_url?: string;
  }>;
}

export async function searchWithOpenAI(
  location: string,
  locationType: "zip" | "county" = "zip"
): Promise<Partial<FoodResource>[]> {
  try {
    const locationPhrase = locationType === "zip"
      ? `near zip code ${location}`
      : `in ${location}`;

    // Use the Responses API with web search
    const response = await (client as any).responses.create({
      model: "gpt-4o-mini",
      tools: [
        {
          type: "web_search_preview",
        },
      ],
      input: `Search for food pantries and food banks ${locationPhrase}.

I need you to:
1. Find AS MANY food resources as possible - aim for 20-30 or more (pantries, food banks, or facilities that provide both)
2. Look for and FOLLOW LINKS to:
   - Directory pages and lists maintained by food banks, counties, or community organizations
   - "Find Food" locator pages that list multiple locations
   - State or county government food assistance pages
3. Cast a wide net - look at multiple sources, directories, and neighborhood-specific resources
4. For each resource found (whether from search results OR from following directory links), verify it is currently operating (not permanently closed)
5. Extract ONLY factual, verifiable information - do NOT make up or estimate any data

IMPORTANT - DO NOT INCLUDE:
- National umbrella organizations (e.g., "Feeding America" national headquarters, state associations, regional networks) - we need actual distribution sites only
- Schools (elementary, middle, high schools, universities) unless they explicitly operate a food pantry as a separate service
- Churches/places of worship unless they explicitly operate a food pantry (not just host food distribution events)
- Commercial businesses (meal prep services, grocery stores, restaurants)
- Government offices unless they are specifically food distribution sites
- Community centers unless they explicitly operate a food pantry
- Locations outside the search area (verify city/state matches the county being searched)

ONLY include locations whose PRIMARY or MAJOR purpose is providing free food assistance to those in need, and which are physically located in the search area.

For each verified resource, provide these fields ONLY if you have concrete evidence:
- name: The official name (REQUIRED)
- address: Street address (REQUIRED)
- city: City name
- state: State abbreviation
- latitude & longitude: Coordinates (only if found in source)
- type: "pantry" (emergency food distribution), "bank" (large-scale food distribution hub), or "mixed" (REQUIRED)
- phone: Contact phone number (only if found)
- hours: Operating hours (only if found, use exact format from source)
- rating: Numeric rating out of 5 (only if you find an actual rating from Google, Yelp, etc. - do NOT estimate)
- wait_time_minutes: Average wait time in minutes (only if explicitly stated somewhere - do NOT estimate)
- eligibility_requirements: Who can receive services (e.g., "Must show ID and proof of residence", "Open to all")
- services_offered: What they provide beyond food (e.g., "SNAP assistance, diapers, hygiene products")
- languages_spoken: Languages available (e.g., "English, Spanish")
- accessibility_notes: Wheelchair access, parking, etc. (only if mentioned)
- notes: Any other relevant information (keep brief, factual only)
- is_verified: true only if you can confirm it's currently operating (REQUIRED)
- verification_notes: How you verified it's open (REQUIRED - e.g., "Official website updated Jan 2025", "Recent Google reviews from 2025")
- source_url: Primary source URL (REQUIRED)

IMPORTANT:
- If you cannot find a specific piece of information, omit that field entirely
- Do NOT include ratings or wait times unless you find them explicitly stated
- Do NOT estimate or infer data

CRITICAL: You MUST return ONLY a single JSON object. Do NOT wrap it in markdown code blocks. Do NOT add any explanatory text before or after the JSON. Your entire response must be parseable as JSON.

Return this exact format:
{
  "resources": [
    {
      "name": "Example Food Pantry",
      "address": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "latitude": 34.0522,
      "longitude": -118.2437,
      "type": "pantry",
      "phone": "(555) 123-4567",
      "hours": "Mon-Fri 9AM-5PM",
      "rating": 4.5,
      "wait_time_minutes": 30,
      "eligibility_requirements": "Must show ID and proof of residence",
      "services_offered": "Food pantry, SNAP enrollment assistance",
      "languages_spoken": "English, Spanish",
      "accessibility_notes": "Wheelchair accessible, free parking lot",
      "is_verified": true,
      "verification_notes": "Verified via official website updated January 2025 and recent Google reviews",
      "source_url": "https://example.com"
    }
  ]
}`,
    });

    const outputText = response.output_text;

    if (!outputText) {
      throw new Error("No response from OpenAI");
    }

    console.log("OpenAI response preview:", outputText.substring(0, 500));

    // Parse JSON from response - handle markdown code blocks and truncated responses
    let jsonText = outputText;

    // Step 1: Try to extract JSON from markdown code blocks (```json ... ```)
    const markdownMatch = outputText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1];
      console.log("Extracted JSON from markdown code block");
    } else {
      // Step 2: Try to find raw JSON block
      const jsonMatch = outputText.match(/\{[\s\S]*"resources"[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Full response:", outputText);
        console.error("\nCould not find JSON in OpenAI response. Logging to failed-responses.log");

        // Log the failed response for manual review
        const fs = await import("fs");
        const logEntry = `\n${"=".repeat(80)}\nTimestamp: ${new Date().toISOString()}\nLocation: ${location}\n${"-".repeat(80)}\n${outputText}\n`;
        fs.appendFileSync("failed-responses.log", logEntry);

        throw new Error("No JSON found in OpenAI response");
      }
      jsonText = jsonMatch[0];
    }

    // Try to fix truncated JSON arrays by adding closing brackets
    let result: OpenAISearchResult;
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn("Initial JSON parse failed, attempting to fix truncated response...");

      // Count opening and closing brackets
      const openBrackets = (jsonText.match(/\[/g) || []).length;
      const closeBrackets = (jsonText.match(/\]/g) || []).length;
      const openBraces = (jsonText.match(/\{/g) || []).length;
      const closeBraces = (jsonText.match(/\}/g) || []).length;

      // Add missing closing brackets/braces
      let fixedJson = jsonText;
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixedJson += "]";
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixedJson += "}";
      }

      try {
        result = JSON.parse(fixedJson);
        console.log("Successfully recovered truncated JSON");
      } catch (secondError) {
        console.error("Could not fix JSON. Original:", jsonText.substring(jsonText.length - 200));
        throw parseError;
      }
    }

    console.log(`OpenAI returned ${result.resources.length} resources`);

    return result.resources;
  } catch (error) {
    console.error("OpenAI search error:", error);
    throw new Error(
      `Failed to search with OpenAI: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ABOUTME: OpenAI API integration with web search for finding food resources
// ABOUTME: Uses GPT-4 with web search to find and verify food pantries/banks

import OpenAI from "openai";
import type { FoodResource } from "./database";

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
1. Find up to 10 food resources (pantries, food banks, or facilities that provide both)
2. For each resource, verify it is currently operating (not permanently closed)
3. Extract ONLY factual, verifiable information - do NOT make up or estimate any data

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

Return ONLY valid JSON in this exact format:
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

    // Parse JSON from response
    const jsonMatch = outputText.match(/\{[\s\S]*"resources"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Full response:", outputText);
      throw new Error("No JSON found in OpenAI response");
    }

    const result: OpenAISearchResult = JSON.parse(jsonMatch[0]);

    return result.resources;
  } catch (error) {
    console.error("OpenAI search error:", error);
    throw new Error(
      `Failed to search with OpenAI: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

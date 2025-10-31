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
    notes?: string;
    is_verified: boolean;
    verification_notes?: string;
    source_url?: string;
  }>;
}

export async function searchWithOpenAI(
  zipCode: string
): Promise<Partial<FoodResource>[]> {
  try {
    // Use the Responses API with web search
    const response = await (client as any).responses.create({
      model: "gpt-4o",
      tools: [
        {
          type: "web_search_preview",
        },
      ],
      input: `Search for food pantries and food banks near zip code ${zipCode}.

I need you to:
1. Find up to 10 food resources (pantries, food banks, or facilities that provide both)
2. For each resource, verify it is currently operating (not permanently closed)
3. Check for any information about wait times or service quality from reviews
4. Categorize each as "pantry", "bank", or "mixed" based on the services offered

For each verified resource, provide:
- name: The official name
- address: Street address
- city: City name
- state: State abbreviation
- latitude & longitude: Coordinates if available
- type: "pantry" (emergency food distribution), "bank" (large-scale food distribution hub), or "mixed"
- phone: Contact phone number
- hours: Operating hours if available
- notes: Any additional info like wait times, services offered, eligibility requirements, ratings
- is_verified: true only if you can confirm it's currently operating
- verification_notes: How you verified it's open (recent reviews, official website, etc.)
- source_url: Primary source URL where you found this information

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
      "notes": "Serves families in need. Average wait time 30 minutes. Rated 4.5/5.",
      "is_verified": true,
      "verification_notes": "Verified via official website and recent reviews from 2025",
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

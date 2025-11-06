// ABOUTME: Expands directory/listing pages into individual food bank entries
// ABOUTME: Fetches directory content and extracts multiple locations using OpenAI

import OpenAI from "openai";
import type { FoodResource } from "./database";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExpansionResult {
  success: boolean;
  new_resources: Partial<FoodResource>[];
  error?: string;
}

export async function expandDirectory(resource: FoodResource): Promise<ExpansionResult> {
  if (!resource.source_url) {
    return {
      success: false,
      new_resources: [],
      error: "No source URL to expand",
    };
  }

  try {
    console.log(`Expanding directory: ${resource.name} (${resource.source_url})`);

    // Use OpenAI web search to fetch and parse the directory
    const response = await (client as any).responses.create({
      model: "gpt-4o-mini",
      tools: [
        {
          type: "web_search_preview",
        },
      ],
      input: `I need you to visit this directory page and extract all individual food pantries and food banks listed on it:

${resource.source_url}

Please visit that URL and extract EVERY individual food pantry, food bank, or meal program location listed.

For each location, provide:
- name: Official name (REQUIRED)
- address: Street address (REQUIRED - must be physical location, not just a city)
- city: City name
- state: State abbreviation (e.g., "TX", "CA")
- phone: Phone number if available
- hours: Operating hours if available
- notes: Any relevant information (eligibility, services, etc.)
- source_url: Use the directory URL if no specific URL is given for this location

IMPORTANT:
- Only include ACTUAL PHYSICAL LOCATIONS with street addresses
- Do NOT include the directory page itself as a resource
- Do NOT include umbrella organizations or networks
- Do NOT include locations without physical addresses
- If a location has its own website listed, use that as source_url instead of the directory URL

Return ONLY valid JSON (no markdown code blocks):
{
  "resources": [
    {
      "name": "Example Food Pantry",
      "address": "123 Main St",
      "city": "Dallas",
      "state": "TX",
      "phone": "(555) 123-4567",
      "hours": "Mon-Fri 9AM-5PM",
      "notes": "Serves families in need",
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
    let jsonText = outputText;

    // Remove markdown code blocks if present
    const markdownMatch = outputText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1];
      console.log("Extracted JSON from markdown code block");
    } else {
      // Try to find raw JSON block
      const jsonMatch = outputText.match(/\{[\s\S]*"resources"[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Could not find JSON in OpenAI response");
        throw new Error("No JSON found in OpenAI response");
      }
      jsonText = jsonMatch[0];
    }

    const result: { resources: Partial<FoodResource>[] } = JSON.parse(jsonText);

    console.log(`Extracted ${result.resources.length} locations from directory`);

    // Inherit metadata from the directory entry where appropriate
    const enrichedResources = result.resources.map(r => ({
      ...r,
      county_name: r.county_name || resource.county_name,
      county_geoid: r.county_geoid || resource.county_geoid,
      state: r.state || resource.state,
      location_type: "county" as const,
      type: (r.type || "mixed") as "pantry" | "bank" | "mixed",
      is_verified: true,
      verification_notes: `Extracted from directory: ${resource.name}`,
      source_url: r.source_url || resource.source_url,
    }));

    return {
      success: true,
      new_resources: enrichedResources,
    };
  } catch (error) {
    console.error("Directory expansion error:", error);
    return {
      success: false,
      new_resources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

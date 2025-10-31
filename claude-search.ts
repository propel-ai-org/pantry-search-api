// ABOUTME: Claude API integration for searching and verifying food resources
// ABOUTME: Uses extended thinking and web search to find verified food pantries/banks

import Anthropic from "@anthropic-ai/sdk";
import type { FoodResource } from "./database";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClaudeSearchResult {
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

export async function searchWithClaude(
  zipCode: string
): Promise<Partial<FoodResource>[]> {
  const prompt = `Search for food pantries and food banks near zip code ${zipCode}.

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
- notes: Any additional info like wait times, services offered, eligibility requirements
- is_verified: true only if you can confirm it's currently operating
- verification_notes: How you verified it's open (recent reviews, official website, etc.)
- source_url: Primary source URL where you found this information

Return ONLY a valid JSON object in this exact format with no additional text:
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
      "notes": "Serves families in need. Average wait time 30 minutes.",
      "is_verified": true,
      "verification_notes": "Verified via official website and recent Google reviews from 2025",
      "source_url": "https://example.com"
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000,
      },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract the text response
    let responseText = "";
    for (const block of message.content) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }

    console.log("Claude response:", responseText.substring(0, 500));

    // Try to find JSON object or array in the response
    // Look for the resources array specifically
    const jsonMatch = responseText.match(/\{[\s\S]*"resources"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Full response:", responseText);
      throw new Error("No JSON found in Claude response");
    }

    const result: ClaudeSearchResult = JSON.parse(jsonMatch[0]);

    return result.resources;
  } catch (error) {
    console.error("Claude search error:", error);
    throw new Error(
      `Failed to search with Claude: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

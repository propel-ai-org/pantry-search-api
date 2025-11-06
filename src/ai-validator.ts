// ABOUTME: AI-powered validation using OpenAI to check if location serves food
// ABOUTME: Uses cheap model to validate suspicious resources quickly

import OpenAI from "openai";
import type { FoodResource } from "./database";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ValidationResult {
  is_food_resource: boolean;
  confidence: number; // 0-100
  reasoning: string;
  recommended_action: "keep" | "delete" | "review";
}

export async function validateWithAI(resource: FoodResource): Promise<ValidationResult> {
  try {
    const prompt = `You are analyzing whether a location provides food assistance to people in need.

Location Information:
- Name: ${resource.name}
- Address: ${resource.address}
- Type: ${resource.type}
${resource.phone ? `- Phone: ${resource.phone}` : ""}
${resource.hours ? `- Hours: ${resource.hours}` : ""}
${resource.notes ? `- Notes: ${resource.notes}` : ""}
${resource.services_offered ? `- Services: ${resource.services_offered}` : ""}
${resource.editorial_summary ? `- Description: ${resource.editorial_summary}` : ""}
${resource.source_url ? `- Source: ${resource.source_url}` : ""}

Question: Is this a location where people can get free food assistance (food pantry, food bank, soup kitchen, meal program, etc.)?

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or explanatory text.

Consider:
1. Is this a financial institution (bank, credit union, ATM)? → NOT a food resource
2. Is this a blood bank, milk bank, or other non-food "bank"? → NOT a food resource
3. Is this a school, church, or community center WITHOUT explicit food services? → NOT a food resource
4. Is this a government office without food distribution services? → NOT a food resource
5. Does the name/description clearly indicate food pantry, food bank, or meal program? → IS a food resource

Return this exact JSON structure:
{
  "is_food_resource": true or false,
  "confidence": 0-100 (how sure are you),
  "reasoning": "brief explanation",
  "recommended_action": "keep" (definite food resource), "delete" (definite not food resource), or "review" (unclear)
}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistent results
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    let jsonText = content.trim();

    // Remove markdown code blocks if present
    const markdownMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1];
    }

    const result = JSON.parse(jsonText) as ValidationResult;

    return result;
  } catch (error) {
    console.error("AI validation error:", error);
    // Return conservative result on error
    return {
      is_food_resource: true, // Conservative: don't delete on error
      confidence: 0,
      reasoning: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      recommended_action: "review",
    };
  }
}

export async function validateBatch(
  resources: FoodResource[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, ValidationResult>> {
  const results = new Map<number, ValidationResult>();

  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    if (!resource.id) continue;

    const result = await validateWithAI(resource);
    results.set(resource.id, result);

    if (onProgress) {
      onProgress(i + 1, resources.length);
    }

    // Rate limiting: small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

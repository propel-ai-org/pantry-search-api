// ABOUTME: Unit tests for OpenAI search response parsing
// ABOUTME: Tests JSON extraction from various response formats including markdown blocks

import { test, expect } from "bun:test";

test("extracts JSON from markdown code block", () => {
  const response = '```json\n{"resources": [{"name": "Test Pantry", "address": "123 Main St", "type": "pantry", "is_verified": true}]}\n```';

  // Test the markdown extraction regex
  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeTruthy();
  expect(markdownMatch![1]).toContain('"resources"');

  const parsed = JSON.parse(markdownMatch![1]);
  expect(parsed.resources).toHaveLength(1);
  expect(parsed.resources[0].name).toBe("Test Pantry");
});

test("extracts JSON from markdown code block without language specifier", () => {
  const response = '```\n{"resources": [{"name": "Test Pantry", "address": "123 Main St", "type": "pantry", "is_verified": true}]}\n```';

  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeTruthy();

  const parsed = JSON.parse(markdownMatch![1]);
  expect(parsed.resources).toHaveLength(1);
});

test("extracts JSON from raw response without markdown", () => {
  const response = '{"resources": [{"name": "Test Pantry", "address": "123 Main St", "type": "pantry", "is_verified": true}]}';

  // Try markdown first (should fail)
  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeFalsy();

  // Then try raw JSON
  const jsonMatch = response.match(/\{[\s\S]*"resources"[\s\S]*\}/);
  expect(jsonMatch).toBeTruthy();

  const parsed = JSON.parse(jsonMatch![0]);
  expect(parsed.resources).toHaveLength(1);
});

test("extracts JSON from response with narrative text before markdown", () => {
  const response = `Based on the available information, here is a list of food assistance resources:

\`\`\`json
{"resources": [{"name": "Test Pantry", "address": "123 Main St", "type": "pantry", "is_verified": true}]}
\`\`\`

For more information, visit the website.`;

  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeTruthy();

  const parsed = JSON.parse(markdownMatch![1]);
  expect(parsed.resources).toHaveLength(1);
});

test("extracts JSON from response with narrative text (no markdown)", () => {
  const response = `Here are the resources I found:

{"resources": [{"name": "Test Pantry", "address": "123 Main St", "type": "pantry", "is_verified": true}]}

Contact them for more information.`;

  // Try markdown first (should fail)
  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeFalsy();

  // Then try raw JSON
  const jsonMatch = response.match(/\{[\s\S]*"resources"[\s\S]*\}/);
  expect(jsonMatch).toBeTruthy();

  const parsed = JSON.parse(jsonMatch![0]);
  expect(parsed.resources).toHaveLength(1);
});

test("handles Ashley County example with partial JSON in markdown", () => {
  // This is similar to the actual Ashley County response that was failing
  const response = `\`\`\`json
{
  "resources": [
    {
      "name": "Ashley County Human Services Department",
      "address": "201 West Lincoln Street",
      "city": "Hamburg",
      "state": "AR",
      "type": "mixed",
      "phone": "(870) 853-2500",
      "hours": "Mon-Fri 8:00 AM - 4:30 PM",
      "is_verified": true,
      "verification_notes": "Verified via official website",
      "source_url": "https://www.arkansasfoodbanks.org/food-bank/ashley-county-human-services-department/"
    }
  ]
}
\`\`\``;

  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeTruthy();

  const parsed = JSON.parse(markdownMatch![1]);
  expect(parsed.resources).toHaveLength(1);
  expect(parsed.resources[0].name).toBe("Ashley County Human Services Department");
  expect(parsed.resources[0].city).toBe("Hamburg");
});

test("fails gracefully when no JSON found", () => {
  const response = "I couldn't find any food pantries in that area. Please try a different search.";

  const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  expect(markdownMatch).toBeFalsy();

  const jsonMatch = response.match(/\{[\s\S]*"resources"[\s\S]*\}/);
  expect(jsonMatch).toBeFalsy();

  // This should trigger the error path that logs to failed-responses.log
});

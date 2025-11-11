// ABOUTME: Validates and updates food resource data using Jina AI web scraping
// ABOUTME: Fetches website content, extracts structured data, and updates database directly

import { initDatabase, type FoodResource, type Database } from "./database";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Concurrency control
const MAX_CONCURRENT_VALIDATIONS = 100; 

function standardizePhoneNumber(phone: string | null): string | null {
  if (!phone) return null;

  // Extract only digits
  const digits = phone.replace(/\D/g, '');

  // Must be 10 digits (US) or 11 digits (starting with 1)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Invalid format - return null
  console.log(`    WARNING: Invalid phone format: ${phone}`);
  return null;
}

interface JinaResponse {
  success: boolean;
  text?: string;
  links?: Record<string, string>;
  error?: string;
}

interface ExtractedData {
  is_food_resource: boolean;
  hours: string | null;
  phone: string | null;
  services: string | null;
  eligibility: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface UpdateAction {
  resource_id: number;
  resource_name: string;
  action: "updated" | "marked_unexportable" | "no_change" | "fetch_failed";
  changes?: string[];
  reason?: string;
}

async function fetchWithJina(url: string): Promise<JinaResponse> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-With-Links-Summary': 'true',
      'X-Return-Format': 'markdown',
    };

    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
    }

    const response = await fetch(jinaUrl, { headers });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.text();

    try {
      const json = JSON.parse(data);
      if (json.data && json.data.content) {
        return {
          success: true,
          text: json.data.content,
          links: json.data.links || {},
        };
      }
      return { success: false, error: 'No content in response' };
    } catch {
      return { success: true, text: data, links: {} };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function selectRelevantLinks(
  links: Array<{ text: string; url: string }>,
  baseUrl: string
): Promise<string[]> {
  if (!links || links.length === 0) {
    return [];
  }

  const linksFormatted = links
    .slice(0, 30)
    .map(l => `"${l.text}" -> ${l.url}`)
    .join('\n');

  const prompt = `You are analyzing links from a food pantry website to find pages that might contain operating hours.

Base URL: ${baseUrl}

Available links:
${linksFormatted}

Select up to 2 link URLs most likely to contain food pantry operating hours or visit information.

Look for links with text like: "Hours", "Visit", "Contact", "About", "Services", "Food Pantry"

Avoid: home pages, donation pages, news/blog pages, external social media links, annual reports

Return only the full URLs (not the link text).`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 200,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'link_selection',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              selected_links: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of up to 2 full URLs to fetch',
              },
            },
            required: ['selected_links'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return [];
    }
    const response = JSON.parse(content);
    return response.selected_links.slice(0, 2);
  } catch (error) {
    console.log(`    ERROR selecting links: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function fetchMultiPageContent(url: string): Promise<JinaResponse & { pages_fetched?: string[] }> {
  const mainResult = await fetchWithJina(url);

  if (!mainResult.success) {
    return mainResult;
  }

  let combinedText = mainResult.text || '';
  const fetchedPages = [url];

  const linksArray = mainResult.links
    ? Object.entries(mainResult.links).map(([text, url]) => ({ text, url }))
    : [];

  if (linksArray.length > 0) {
    const selectedLinks = await selectRelevantLinks(linksArray, url);

    if (selectedLinks.length > 0) {
      for (const link of selectedLinks) {
        await new Promise(resolve => setTimeout(resolve, 3500));

        const subResult = await fetchWithJina(link);

        if (subResult.success && subResult.text) {
          combinedText += '\n\n--- Additional page: ' + link + ' ---\n\n' + subResult.text;
          fetchedPages.push(link);
        }
      }
    }
  }

  return {
    success: true,
    text: combinedText.substring(0, 12000),
    pages_fetched: fetchedPages,
  };
}

async function extractDataFromWebsite(websiteText: string): Promise<ExtractedData> {
  const prompt = `You are extracting information from a food pantry/food bank website.

Website text: "${websiteText}"

Extract the following information:
1. Is this actually a food pantry/food bank website? (Check if it's a financial institution, directory page, or unrelated site)
2. Operating hours - Extract the EXACT text as stated on the website. Return null if not found.
3. Phone number - Extract ONLY ONE primary/main phone number for this location. If multiple numbers are listed, choose the main contact number. Format cleanly (e.g., "(555) 123-4567" or "555-123-4567"). Return null if not found.
4. Services offered - Extract ONLY what is explicitly stated. Return null if not found. DO NOT infer, summarize, or add commentary.
5. Eligibility requirements - Extract ONLY what is explicitly stated. Return null if not found. DO NOT infer, summarize, or add commentary.

CRITICAL RULES:
- If this appears to be a directory page listing multiple organizations, return is_food_resource=false
- NEVER add phrases like "not explicitly stated", "appears to", "seems to", etc.
- NEVER infer information that isn't directly stated
- If information is not clearly present, return null
- Extract verbatim or close paraphrase only`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'website_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              is_food_resource: {
                type: 'boolean',
                description: 'True if this is actually a food pantry/bank website',
              },
              hours: {
                type: ['string', 'null'],
                description: 'Operating hours extracted from website, or null if not found',
              },
              phone: {
                type: ['string', 'null'],
                description: 'Phone number extracted from website, or null if not found',
              },
              services: {
                type: ['string', 'null'],
                description: 'Services offered, or null if not found',
              },
              eligibility: {
                type: ['string', 'null'],
                description: 'Eligibility requirements, or null if not found',
              },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Confidence level in this analysis',
              },
              reasoning: {
                type: 'string',
                description: 'Brief explanation of findings',
              },
            },
            required: ['is_food_resource', 'hours', 'phone', 'services', 'eligibility', 'confidence', 'reasoning'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    const extracted = JSON.parse(content);

    // Validate phone number - should only be one number
    if (extracted.phone && extracted.phone.includes(',')) {
      console.log(`    WARNING: Multiple phone numbers detected, discarding: ${extracted.phone}`);
      extracted.phone = null;
    }

    // Standardize phone number format to (XXX) XXX-XXXX
    if (extracted.phone) {
      const standardized = standardizePhoneNumber(extracted.phone);
      if (standardized !== extracted.phone) {
        console.log(`    Standardized phone: "${extracted.phone}" → "${standardized}"`);
      }
      extracted.phone = standardized;
    }

    return extracted;
  } catch (error) {
    console.log(`    ERROR in LLM call: ${error instanceof Error ? error.message : String(error)}`);
    return {
      is_food_resource: true,
      hours: null,
      phone: null,
      services: null,
      eligibility: null,
      confidence: 'low',
      reasoning: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function updateResourceFromWebsite(
  db: Database,
  resource: FoodResource,
  extractedData: ExtractedData
): Promise<UpdateAction> {
  const changes: string[] = [];

  // If not a food resource, mark as unexportable
  if (!extractedData.is_food_resource) {
    const notes = `Not a food resource: ${extractedData.reasoning}`;
    await db`
      UPDATE resources
      SET
        exportable = ${false},
        verification_notes = ${notes}
      WHERE id = ${resource.id}
    `;
    return {
      resource_id: resource.id!,
      resource_name: resource.name,
      action: 'marked_unexportable',
      reason: extractedData.reasoning,
    };
  }

  // Update hours if we found better data
  if (extractedData.hours && extractedData.hours !== resource.hours) {
    changes.push(`Updated hours: "${resource.hours || 'none'}" → "${extractedData.hours}"`);
  }

  // Update phone if we found better data
  if (extractedData.phone && extractedData.phone !== resource.phone) {
    changes.push(`Updated phone: "${resource.phone || 'none'}" → "${extractedData.phone}"`);
  }

  // Update services if we found new data
  if (extractedData.services && extractedData.services !== resource.services_offered) {
    changes.push(`Updated services: "${resource.services_offered || 'none'}" → "${extractedData.services}"`);
  }

  // Update eligibility if we found new data
  if (extractedData.eligibility && extractedData.eligibility !== resource.eligibility_requirements) {
    changes.push(`Updated eligibility: "${resource.eligibility_requirements || 'none'}" → "${extractedData.eligibility}"`);
  }

  // If we have changes, update the database
  if (changes.length > 0) {
    await db`
      UPDATE resources
      SET
        hours = ${extractedData.hours || resource.hours},
        phone = ${extractedData.phone || resource.phone},
        services_offered = ${extractedData.services || resource.services_offered},
        eligibility_requirements = ${extractedData.eligibility || resource.eligibility_requirements},
        verification_notes = ${`Validated via Jina on ${new Date().toISOString()}: ${extractedData.reasoning}`},
        last_verified_at = CURRENT_TIMESTAMP
      WHERE id = ${resource.id}
    `;

    return {
      resource_id: resource.id!,
      resource_name: resource.name,
      action: 'updated',
      changes,
    };
  }

  return {
    resource_id: resource.id!,
    resource_name: resource.name,
    action: 'no_change',
  };
}

async function validateResource(db: Database, resource: FoodResource): Promise<UpdateAction> {
  try {
    console.log(`  - Validating: ${resource.name} (ID: ${resource.id})`);

    if (!resource.source_url) {
      console.log(`  - SKIP: No source URL`);
      return {
        resource_id: resource.id!,
        resource_name: resource.name,
        action: 'no_change',
        reason: 'No source URL',
      };
    }

    console.log(`  - Fetching via Jina: ${resource.source_url}`);
    const webResult = await fetchMultiPageContent(resource.source_url);

    if (!webResult.success) {
      console.log(`  - Fetch FAILED: ${webResult.error}`);
      // Mark as unexportable if website is down/broken
      const notes = `Website failed to load: ${webResult.error}`;
      await db`
        UPDATE resources
        SET
          exportable = ${false},
          verification_notes = ${notes}
        WHERE id = ${resource.id}
      `;
      return {
        resource_id: resource.id!,
        resource_name: resource.name,
        action: 'marked_unexportable',
        reason: `Website failed: ${webResult.error}`,
      };
    }

    console.log(`  - Fetched ${webResult.text?.length || 0} chars from ${webResult.pages_fetched?.length || 1} page(s)`);
    console.log(`  - Extracting data with LLM...`);
    const extractedData = await extractDataFromWebsite(webResult.text || '');

    console.log(`  - Is food resource: ${extractedData.is_food_resource}`);
    console.log(`  - Confidence: ${extractedData.confidence}`);

    const updateAction = await updateResourceFromWebsite(db, resource, extractedData);
    console.log(`  - Action: ${updateAction.action}`);
    if (updateAction.changes) {
      updateAction.changes.forEach(change => console.log(`    • ${change}`));
    }

    return updateAction;
  } catch (error) {
    console.log(`  - EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
    return {
      resource_id: resource.id!,
      resource_name: resource.name,
      action: 'no_change',
      reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args[0] ? parseInt(args[0]) : null;
  const state = args[1] || null;

  if (!limit || limit <= 0) {
    console.error('Usage: bun src/validate-with-jina.ts <limit> [state]');
    console.log('Example: bun src/validate-with-jina.ts 50 CA');
    console.log('         bun src/validate-with-jina.ts 100');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('Initializing database...');
  const db = await initDatabase();

  console.log('Querying exportable resources...');
  const resources = await db<FoodResource[]>`
    SELECT * FROM resources
    WHERE exportable = true
      AND source_url IS NOT NULL
      AND source_url != ''
      ${state ? db`AND state = ${state.toUpperCase()}` : db``}
    ORDER BY
      CASE
        WHEN verification_notes IS NULL OR verification_notes NOT LIKE '%Validated via Jina%' THEN 0
        ELSE 1
      END,
      last_verified_at ASC NULLS FIRST
    LIMIT ${limit}
  `;

  console.log(`Found ${resources.length} exportable resources\n`);
  console.log(`Processing with ${MAX_CONCURRENT_VALIDATIONS} concurrent workers\n`);

  const actions: UpdateAction[] = [];
  let completed = 0;

  // Process resources in batches
  for (let i = 0; i < resources.length; i += MAX_CONCURRENT_VALIDATIONS) {
    const batch = resources.slice(i, i + MAX_CONCURRENT_VALIDATIONS);

    // Process batch in parallel
    const batchPromises = batch.map(async (resource, batchIndex) => {
      const resourceNumber = i + batchIndex + 1;
      console.log(`\nProcessing ${resourceNumber}/${resources.length}: ${resource.name}`);

      const action = await validateResource(db, resource);
      completed++;

      return action;
    });

    // Wait for all in batch to complete
    const batchResults = await Promise.all(batchPromises);
    actions.push(...batchResults);

    console.log(`\n=== Progress: ${completed}/${resources.length} ===\n`);

    // Small delay between batches to avoid overwhelming the API
    if (i + MAX_CONCURRENT_VALIDATIONS < resources.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Print summary
  console.log(`\n=== Summary ===`);
  console.log(`Total processed: ${resources.length}`);

  const updated = actions.filter(a => a.action === 'updated');
  const markedUnexportable = actions.filter(a => a.action === 'marked_unexportable');
  const noChange = actions.filter(a => a.action === 'no_change');

  console.log(`Updated: ${updated.length}`);
  console.log(`Marked unexportable: ${markedUnexportable.length}`);
  console.log(`No change: ${noChange.length}`);

  if (updated.length > 0) {
    console.log(`\n=== Updated Resources (showing first 5) ===`);
    updated.slice(0, 5).forEach(a => {
      console.log(`\n${a.resource_name} (ID: ${a.resource_id})`);
      a.changes?.forEach(change => console.log(`  • ${change}`));
    });
  }

  if (markedUnexportable.length > 0) {
    console.log(`\n=== Marked Unexportable (showing first 5) ===`);
    markedUnexportable.slice(0, 5).forEach(a => {
      console.log(`${a.resource_name} (ID: ${a.resource_id}): ${a.reason}`);
    });
  }

  await db.end();
}

main().catch(console.error);

// ABOUTME: Validates and enriches food resource data using Jina AI web scraping
// ABOUTME: Fetches website content, extracts structured data, and returns enrichment data

import OpenAI from "openai";
import type { FoodResource, Database } from "./database";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export interface ExtractedData {
  is_food_resource: boolean;
  hours: string | null;
  phone: string | null;
  services: string | null;
  eligibility: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface JinaValidationResult {
  success: boolean;
  extracted_data?: ExtractedData;
  error?: string;
  should_mark_unexportable?: boolean;
  unexportable_reason?: string;
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

/**
 * Validates a food resource using Jina AI web scraping
 * Returns extracted data that can be used to update the resource
 */
export async function validateResourceWithJina(
  resource: FoodResource
): Promise<JinaValidationResult> {
  try {
    if (!resource.source_url) {
      return {
        success: false,
        error: 'No source URL',
      };
    }

    console.log(`[Jina] Validating: ${resource.name} (${resource.source_url})`);

    const webResult = await fetchMultiPageContent(resource.source_url);

    if (!webResult.success) {
      console.log(`[Jina] Fetch failed: ${webResult.error}`);
      return {
        success: false,
        should_mark_unexportable: true,
        unexportable_reason: `Website failed to load: ${webResult.error}`,
      };
    }

    console.log(`[Jina] Fetched ${webResult.text?.length || 0} chars from ${webResult.pages_fetched?.length || 1} page(s)`);

    const extractedData = await extractDataFromWebsite(webResult.text || '');

    console.log(`[Jina] Is food resource: ${extractedData.is_food_resource} (confidence: ${extractedData.confidence})`);

    if (!extractedData.is_food_resource) {
      return {
        success: true,
        extracted_data: extractedData,
        should_mark_unexportable: true,
        unexportable_reason: `Not a food resource: ${extractedData.reasoning}`,
      };
    }

    return {
      success: true,
      extracted_data: extractedData,
    };
  } catch (error) {
    console.log(`[Jina] Exception: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Applies Jina validation results to a resource in the database
 */
export async function applyJinaValidation(
  db: Database,
  resource: FoodResource,
  validationResult: JinaValidationResult
): Promise<void> {
  if (!validationResult.success || !validationResult.extracted_data) {
    // Mark as unexportable if validation failed or determined it's not a food resource
    if (validationResult.should_mark_unexportable) {
      await db`
        UPDATE resources
        SET
          exportable = ${false},
          verification_notes = ${validationResult.unexportable_reason || 'Jina validation failed'}
        WHERE id = ${resource.id}
      `;
      console.log(`[Jina] ⛔ Marked unexportable: ${resource.name}`);
    }
    return;
  }

  const extracted = validationResult.extracted_data;

  // Update resource with extracted data
  await db`
    UPDATE resources
    SET
      hours = COALESCE(${extracted.hours}, hours),
      phone = COALESCE(${extracted.phone}, phone),
      services_offered = COALESCE(${extracted.services}, services_offered),
      eligibility_requirements = COALESCE(${extracted.eligibility}, eligibility_requirements),
      verification_notes = ${`Validated via Jina on ${new Date().toISOString()}: ${extracted.reasoning}`},
      last_verified_at = CURRENT_TIMESTAMP
    WHERE id = ${resource.id}
  `;

  console.log(`[Jina] ✅ Updated: ${resource.name}`);
}

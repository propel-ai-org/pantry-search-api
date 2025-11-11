# Pantry Search Application - Comprehensive Architecture & AI Integration Guide

## Executive Summary

Pantry Search is a sophisticated food resource discovery and verification system that uses multiple AI/ML techniques to systematically find, validate, and maintain accurate data about food pantries and food banks across all 3,222 US counties. The application combines web search AI, geolocation APIs, content extraction, and heuristic analysis to create a comprehensive, quality-controlled database.

**Codebase Size:** ~7,600 lines of TypeScript across 25+ source modules
**Tech Stack:** Bun runtime, OpenAI APIs, Google Places API, Jina AI, PostgreSQL

---

## Part 1: Overall Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     PANTRY SEARCH API                       │
│                    (Bun HTTP Server)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Search Endpoints:                                         │
│  • /search?zip={code}                                      │
│  • /search-county?county={name}&state={code}              │
│  • /search-county-jina (POST)                             │
│                                                             │
│  Data Management:                                          │
│  • /expand-directory (POST) - Break up listings           │
│  • /bulk-actions (POST) - Delete/validate/re-enrich      │
│  • /bulk-validate-urls (POST) - Stream URL validation    │
│  • /mark-exportable (POST)                                │
│  • /update-url (POST)                                      │
│                                                             │
│  Monitoring:                                              │
│  • /status/counties - Overall progress                    │
│  • /status/counties/{state} - State-specific              │
│  • /status/enrichment - Enrichment queue status           │
│  • /status/unprocessed - Missing counties                 │
│  • /analyze-resources - Find suspicious entries           │
│  • /analyze-ui - Interactive web UI                       │
│                                                             │
│  Data Export:                                             │
│  • /export?state={code} - Exportable resources            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
    ┌────────────┐   ┌──────────────┐   ┌──────────────┐
    │ PostgreSQL │   │Background    │   │  External   │
    │ Database   │   │Enrichment    │   │   APIs      │
    │            │   │Worker        │   │             │
    │• resources │   │              │   │• OpenAI     │
    │• searches  │   │Continuously  │   │• Google     │
    │• tracking  │   │enriches new  │   │  Places     │
    │            │   │resources     │   │• Jina AI    │
    └────────────┘   └──────────────┘   └──────────────┘
```

### Core Entry Points

**Main Server** (`src/index.ts`): 
- HTTP API server handling all endpoints
- Background enrichment worker initialization
- Request routing and response formatting
- Error handling and validation

**CLI Tools** (`src/process-counties.ts`):
- Systematically processes all 3,222 US counties
- State-level filtering and batch processing
- County search tracking and force-reprocess capability

**Supporting Modules** (25+ files):
- `search.ts` / `county-search.ts` - Search orchestration
- `openai-search.ts` / `jina-search.ts` - AI-powered discovery
- `google-places.ts` - Location verification and enrichment
- `database.ts` - Schema and connection management
- `enrichment-worker.ts` - Background processing
- `validate-with-jina.ts` - Data quality validation
- `false-positive-detector.ts` - Heuristic filtering
- `ai-validator.ts` - AI-based verification
- `counties.ts` - Census Bureau data integration
- `monitoring.ts` - Progress tracking
- `status-page.ts` / `analyze-page.ts` - UI generation

---

## Part 2: AI Integration Deep Dive

### 1. OpenAI Integration (Web Search & Data Extraction)

**Purpose:** Primary discovery mechanism using GPT-4o-mini with web search capability

**Key Files:**
- `src/openai-search.ts` - Web search for food resources
- `src/ai-validator.ts` - Validation of suspicious resources
- `src/directory-expander.ts` - Directory page extraction

**How It Works:**

```typescript
// searchWithOpenAI(location, locationType)
// Uses OpenAI's Responses API with web_search_preview tool
// Model: gpt-4o-mini

INPUT:
  - Location (zip code or county name)
  - Type: "zip" or "county"

PROMPT STRATEGY:
  1. Instructs AI to find 20-30+ resources
  2. Follow directory links and lists
  3. Multi-source discovery (government, nonprofits, community orgs)
  4. Exclude false positives (churches, schools, commercial)
  5. Extract: name, address, city, state, lat/long, phone, hours,
     eligibility, services, languages, accessibility notes, verification

OUTPUT FORMAT: JSON with array of food resources
  - Required: name, address, type, is_verified, verification_notes, source_url
  - Optional: All other fields only if found
  - Includes reasoning for verification

ERROR HANDLING:
  - Markdown code block extraction (```json ... ```)
  - Truncated JSON repair (adds missing brackets)
  - Failed response logging to failed-responses.log
```

**Validation Use Case:**

```typescript
// validateWithAI(resource)
// Uses GPT-4o-mini at temperature 0 (deterministic)
// ~200 token response per resource

VALIDATION RULES:
  - Is it a financial institution? → NOT food resource
  - Is it blood/milk/tissue bank? → NOT food resource  
  - Is it school/church/gov without food services? → NOT food resource
  - Does name clearly indicate food assistance? → IS food resource

RETURNS: {
  is_food_resource: boolean,
  confidence: 0-100,
  reasoning: string,
  recommended_action: "keep" | "delete" | "review"
}
```

**Directory Expansion Use Case:**

```typescript
// expandDirectory(resource)
// Uses OpenAI responses API with web_search_preview
// Extracts individual locations from listing pages

WORKFLOW:
  1. Fetch directory page URL
  2. Extract ALL individual locations listed
  3. Collect: name, address, city, state, phone, hours, notes
  4. Mark source_url (prefer location's own website if available)
  5. Create separate database entries for each
  6. Delete original directory entry

USE CASES:
  - Regional food bank directories
  - County "Find Food" locator pages
  - Government assistance resource listings
```

### 2. Jina AI Integration (Content Extraction & Web Scraping)

**Purpose:** High-fidelity web scraping and structured data extraction for validation

**Key Files:**
- `src/jina-search.ts` - Search results with geographic filtering
- `src/validate-with-jina.ts` - Website content fetching and data validation

**How It Works:**

```typescript
// Two distinct Jina integrations:

A) JINA SEARCH API (s.jina.ai)
   Purpose: Find food resources via search
   Used by: /search-county-jina endpoint
   
   WORKFLOW:
     1. Query: "Food pantries and food banks in {location}"
     2. Fetch search results (paginated, ~10 per page)
     3. For each result, extract via GPT-4o-mini:
        - Verify it's a food resource (not directory/false positive)
        - Geographic filtering (reject major cities outside search area)
        - Extract structured data
     4. Deduplicate by URL
     5. Store in database
   
   GEOGRAPHIC FILTERING:
     - Reject regional food banks in major cities (Anchorage, LA, NYC, etc.)
     - Requires resource to be physically located in search area
     - Avoids storing umbrella organizations

B) JINA READER API (r.jina.ai) 
   Purpose: Fetch website content for validation
   Used by: validate-with-jina.ts script
   
   WORKFLOW:
     1. Convert URL to Jina Reader endpoint
     2. Fetch page content (markdown format)
     3. Extract relevant subpage links (via GPT-4o-mini)
     4. Fetch up to 2 additional relevant pages
     5. LLM extraction of: hours, phone, services, eligibility
     6. Validate before updating database
   
   RATE LIMITING:
     - Without API key: 20 requests/minute (public tier)
     - With API key: 100+ requests/minute (premium tier)
     - Batch processing: 25 concurrent validations
```

**Data Extraction & Validation:**

```typescript
// validate-with-jina.ts high-level flow

SELECTION STRATEGY (Smart Resource Prioritization):
  1. Find exportable resources (has valid source_url)
  2. Prioritize: Never Jina-validated → Oldest validation
  3. Process up to N resources per run
  4. Each run validates different resources (no duplication)

VALIDATION ACTIONS:
  
  1. UPDATED:
     - New/better phone number (standardized to (XXX) XXX-XXXX)
     - Updated hours (more complete or current)
     - Services/eligibility info added
     - Logs before/after values
  
  2. MARKED UNEXPORTABLE:
     - Website no longer exists (404, 5xx errors)
     - Site content indicates NOT a food resource
     - Directory page (lists multiple orgs, not a single location)
     - Confidence issues
  
  3. NO CHANGE:
     - Already has all available information
     - Website doesn't have additional data
  
  4. FETCH_FAILED:
     - Network error, timeout, access denied
     - Jina API returned error

PHONE NUMBER STANDARDIZATION:
  - Extract digits only
  - 10 digits → (XXX) XXX-XXXX
  - 11 digits starting with 1 → (XXX) XXX-XXXX
  - Invalid formats → rejected with warning
  - Takes only FIRST/PRIMARY phone number (rejects lists)

CONFIDENCE LEVELS:
  - high: Website clearly states info, multiple sources agree
  - medium: Reasonable inference from available data
  - low: Uncertain or partial information

DATABASE UPDATES:
  - Updates: hours, phone, services_offered, eligibility_requirements
  - Logs all changes in verification_notes with timestamps
  - Sets last_verified_at = NOW()
  - For failures: enrichment_failure_count++, enrichment_failure_reason
  - Rate limiting: Process 25 concurrently, batch size respects Jina limits
```

### 3. Google Places API Integration

**Purpose:** Location verification, enrichment, and operational status checking

**Key Files:**
- `src/google-places.ts` - API integration and enrichment
- `src/google-places-search.ts` - Place discovery via Google Places

**How It Works:**

```typescript
// enrichWithGooglePlaces(resource)
// Single-pass enrichment: all data fetched in one operation
// Called during initial search - no duplicate enrichment needed

STEP 1: FIND PLACE (Text Search)
  Input: resource.name, address, city, state
  Query: "{name} {address} {city} {state}"
  Returns: place_id, coordinates, business_status, rating

STEP 2: GET PLACE DETAILS
  Input: place_id from step 1
  Returns:
    - Verified name & address
    - Latitude, longitude
    - Phone number (formatted)
    - Opening hours (weekday text)
    - Business status (OPERATIONAL, PERMANENTLY_CLOSED, etc.)
    - Ratings & review counts
    - Accessibility features:
      * wheelchair_accessible_entrance
      * curbside_pickup
      * delivery
      * takeout
    - Editorial summary
    - Website & social media URLs

STEP 3: EXTRACT SOCIAL MEDIA
  Input: search results, place details
  Extract: Facebook, Instagram, Twitter, YouTube URLs
  Via: social-media-extractor.ts

ERROR HANDLING:
  - "Permanently closed" → Mark as unexportable
  - "No results found" → Keep original data, flag for review
  - Timeouts → Increment failure count, retry later
  - Invalid API key → Return original resource

DATABASE UPDATES on Success:
  - name, address, city, state (verified/corrected)
  - latitude, longitude (precise from Google)
  - phone (standardized format)
  - hours (weekday text from Google)
  - rating, user_ratings_total
  - google_place_id
  - wheelchair_accessible, has_curbside_pickup, has_delivery, has_takeout
  - editorial_summary
  - url_facebook, url_twitter, url_instagram, url_youtube
  - verification_notes, last_verified_at
  - needs_enrichment = false
```

**Google Places Search (Discovery):**

```typescript
// searchGooglePlaces(county)
// Systematic discovery of food resources via Google Places API

SEARCH QUERIES:
  1. "food pantry {county}, {state}"
  2. "food bank {county}, {state}"
  3. "SNAP assistance {county}, {state}"
  4. "meal programs {county}, {state}"
  5. "food assistance {county}, {state}"

FOR EACH RESULT:
  - Verify it's actually a food resource (not false positive)
  - Extract location data
  - Flag for enrichment

RATE LIMITING:
  - Small delays between requests
  - Error handling for quota exceeded
```

---

## Part 3: Data Flow & Processing Workflows

### Workflow 1: Zip Code Search

```
User: GET /search?zip=94102
        │
        ├─→ Check cached results (30-day TTL)
        │   ├─ If valid cache exists → Return cached results
        │   └─ If expired or missing → Continue to search
        │
        ├─→ searchWithOpenAI(zipCode, "zip")
        │   └─ OpenAI web search: find 20-30+ resources
        │
        ├─→ Deduplicate by address normalization
        │
        ├─→ filterBySource(results)
        │   └─ Remove unreliable domains/names (source-filter.ts)
        │
        ├─→ For each result: enrichWithGooglePlaces()
        │   ├─ Text Search: Verify location exists
        │   ├─ Place Details: Get all data in single pass
        │   │   └─ coordinates, phone, hours, accessibility, rating,
        │   │       website, social media, business status
        │   └─ Social media extraction from website
        │
        ├─→ storeResults() in database
        │   └─ needs_enrichment defaults to false (already enriched)
        │
        ├─→ recordSearch() in zip_searches table
        │
        └─→ categorizeResults(pantries, banks, mixed)
            └─ Return as SearchResult JSON

Background Process:
        enrichmentWorker continuously:
        1. Queries resources WHERE needs_enrichment = true
        2. Re-enriches resources that failed initial enrichment
        3. Optionally runs Jina validation if API key present

        Note: Most resources have needs_enrichment=false after
        initial search since enrichWithGooglePlaces() already
        fetches all data. The worker mainly handles retry logic.
```

### Workflow 2: County-Based Search

```
User: GET /search-county?county=San%20Francisco&state=CA
        │
        ├─→ findCounty(name, state)
        │   └─ Load from Census data (counties.ts)
        │
        ├─→ Check cached results (30-day TTL)
        │   └─ Query: SELECT * FROM resources WHERE county_geoid = ?
        │
        ├─→ searchGooglePlaces(county)
        │   └─ Multiple queries: food pantry, food bank, SNAP, meals
        │
        ├─→ searchWithOpenAI(countyQuery, "county")
        │   └─ Multiple searches with varying keywords
        │
        ├─→ Deduplicate by address
        │
        ├─→ filterBySource()
        │
        ├─→ Geographic filtering
        │   └─ Reject resources in wrong state
        │
        ├─→ Check against existing resources
        │   ├─ If new address → storeResults()
        │   └─ If known address → updateResults() if needed
        │
        ├─→ Set location_type = "county"
        │   └─ Set needs_enrichment based on enrichment result:
        │       ├─ If google_place_id present → false (already enriched)
        │       └─ If google_place_id missing → true (needs retry)
        │
        └─→ recordSearch() in county_searches table
            ├─ county_geoid, county_name, state
            ├─ result_count
            └─ searched_at = NOW()
```

### Workflow 3: County Processing (Batch CLI)

```
CLI: bun src/process-counties.ts --state=CA --batch-size=10
        │
        ├─→ parseArgs()
        │   └─ Extract: state, batch-size, force
        │
        ├─→ loadCounties() from Census gazetteer file
        │   └─ 3,222 total US counties
        │
        ├─→ getCountiesByState(state)
        │   └─ Filter to specified state
        │
        ├─→ Check county_searches table for already-processed
        │   └─ Unless --force flag set
        │
        ├─→ For each county in batches:
        │   │
        │   └─→ searchFoodResourcesByCounty(county)
        │       └─ (Same as Workflow 2)
        │
        ├─→ Display progress per batch
        │
        └─→ Final summary
            └─ Total counties processed: X/Y
```

### Workflow 4: Jina-Based Validation & Updating

```
CLI: bun src/validate-with-jina.ts 50 CA
        │
        ├─→ Select resources for validation
        │   ├─ Priority 1: Never Jina-validated
        │   ├─ Priority 2: Oldest validation_timestamp
        │   └─ Limit: parameter (50)
        │
        ├─→ For each resource (batch size 25):
        │   │
        │   ├─→ fetchWithJina(source_url)
        │   │   └─ Convert URL → https://r.jina.ai/{url}
        │   │       └─ Returns markdown content
        │   │
        │   ├─→ selectRelevantLinks(pages)
        │   │   └─ LLM picks 2 most relevant subpages
        │   │       (hours, contact, visit info)
        │   │
        │   ├─→ For each selected link: fetchWithJina() again
        │   │
        │   ├─→ extractDataWithLLM(allContent)
        │   │   └─ Prompts GPT-4o-mini to extract:
        │   │       * is_food_resource: bool
        │   │       * hours: string | null
        │   │       * phone: string | null  
        │   │       * services: string | null
        │   │       * eligibility: string | null
        │   │       * confidence: high|medium|low
        │   │       * reasoning: string
        │   │
        │   └─→ If valid food resource:
        │       ├─ standardizePhoneNumber()
        │       ├─ Compare with existing data
        │       ├─ If better: UPDATE database
        │       │   └─ Log changes: "Updated hours: X → Y"
        │       ├─ Set last_verified_at = NOW()
        │       └─ Action: "updated" | "no_change"
        │
        │   └─→ If NOT food resource:
        │       ├─ Mark: exportable = false
        │       ├─ enrichment_failure_reason = reason
        │       └─ Action: "marked_unexportable"
        │
        ├─→ Rate limiting: 25 concurrent fetches
        │
        └─→ Summary report:
            ├─ Total processed: X
            ├─ Updated: Y
            ├─ Marked unexportable: Z
            └─ Failed: W
```

### Workflow 5: False Positive Detection & Removal

```
GET /analyze-resources?state=CA&min_suspicion=50&type=bank
        │
        ├─→ Load all matching resources
        │   └─ Query: SELECT * FROM resources
        │       WHERE state = 'CA' AND type = 'bank'
        │
        ├─→ analyzeResource() for each
        │   │
        │   └─→ Check against patterns:
        │       ├─ Financial patterns (ATM, Wells Fargo, etc.)
        │       │  └─ Score +20-85 (context dependent)
        │       ├─ Wrong bank type (blood, milk, organ, seed)
        │       │  └─ Score +40
        │       ├─ Government offices (tax, planning, etc.)
        │       │  └─ Score +30-60
        │       ├─ Law enforcement
        │       │  └─ Score +50-70
        │       ├─ Generic communities (churches, rec centers)
        │       │  └─ Score +20-50
        │       ├─ Schools
        │       │  └─ Score +30-50
        │       ├─ Directory pages
        │       │  └─ Score +75-85
        │       └─ Generic/vague names
        │           └─ Score +20
        │
        │   Reduce suspicion for positive indicators:
        │   └─ Contains "food pantry/bank" → Score -50
        │
        ├─→ Categorize by primary suspicion reason
        │   ├─ financial_bank
        │   ├─ wrong_bank_type
        │   ├─ government_office
        │   ├─ community_center
        │   ├─ school
        │   ├─ directory_page
        │   └─ unclear
        │
        ├─→ Filter by min_suspicion (default 50)
        │
        └─→ Return suspicious resources with:
            ├─ Suspicion score (0-100)
            ├─ Reasons array
            ├─ Category
            └─ Actionable items (delete, validate, re-enrich)
```

### Workflow 6: Bulk URL Validation (Streaming)

```
POST /bulk-validate-urls {resource_ids: [1,2,3,...]}
        │
        ├─→ Get resources with source_url
        │
        ├─→ Create streaming response (ReadableStream)
        │   └─ New-line-delimited JSON (NDJSON) format
        │
        ├─→ For each resource (concurrency=10):
        │   │
        │   ├─→ fetch(source_url) with 10s timeout
        │   │
        │   ├─→ Check HTTP status
        │   │   └─ If not 200: Mark invalid
        │   │
        │   ├─→ Parse HTML content
        │   │
        │   ├─→ Search for food keywords:
        │   │   ├─ pantry, food bank, food pickup, food distribution
        │   │   ├─ meal, feeding, nutrition, hungry
        │   │   ├─ donation, free food, emergency food, soup kitchen
        │   │   ├─ food shelf, food ministry, food program
        │   │   └─ (13 total keywords)
        │   │
        │   ├─→ If any keywords found:
        │   │   └─ valid=true, keep resource
        │   │
        │   └─→ If no keywords:
        │       └─ valid=false, set exportable=false
        │
        ├─→ Stream results as JSON objects (one per line)
        │   └─ Includes progress: {type: 'progress', completed, total, result}
        │
        └─→ Final summary
            └─ {type: 'complete', total, valid_count, invalid_count, results[]}
```

---

## Part 4: Database Schema & State Tracking

### Core Tables

**resources** (Food pantries and banks):
```sql
id SERIAL PRIMARY KEY
name TEXT NOT NULL
address TEXT NOT NULL
city TEXT
state TEXT
zip_code TEXT
county_name TEXT
county_geoid TEXT
location_type TEXT ('zip' | 'county' | null)
latitude DOUBLE PRECISION
longitude DOUBLE PRECISION
type TEXT NOT NULL ('pantry' | 'bank' | 'mixed')
phone TEXT
hours TEXT
rating DOUBLE PRECISION
wait_time_minutes INTEGER
eligibility_requirements TEXT
services_offered TEXT
languages_spoken TEXT
accessibility_notes TEXT
notes TEXT
is_verified BOOLEAN (DEFAULT false)
verification_notes TEXT
source_url TEXT
url_facebook TEXT
url_twitter TEXT
url_instagram TEXT
url_youtube TEXT
wheelchair_accessible BOOLEAN
has_curbside_pickup BOOLEAN
has_delivery BOOLEAN
has_takeout BOOLEAN
editorial_summary TEXT
created_at TIMESTAMP (DEFAULT CURRENT_TIMESTAMP)
last_verified_at TIMESTAMP
needs_enrichment BOOLEAN (DEFAULT false)
google_place_id TEXT
last_enrichment_attempt TIMESTAMP
enrichment_failure_count INTEGER (DEFAULT 0)
enrichment_failure_reason TEXT
exportable BOOLEAN (DEFAULT false)

Indexes:
  idx_zip_code ON resources(zip_code)
  idx_county_geoid ON resources(county_geoid)
  idx_location ON resources(latitude, longitude)
  idx_location_type ON resources(location_type)
```

**zip_searches** (Search cache):
```sql
id SERIAL PRIMARY KEY
zip_code TEXT NOT NULL
searched_at TIMESTAMP (DEFAULT CURRENT_TIMESTAMP)
result_count INTEGER
```

**county_searches** (County processing tracking):
```sql
id SERIAL PRIMARY KEY
county_geoid TEXT NOT NULL (UNIQUE)
county_name TEXT NOT NULL
state TEXT NOT NULL
searched_at TIMESTAMP (DEFAULT CURRENT_TIMESTAMP)
result_count INTEGER
```

### Key State Fields

**needs_enrichment**: Boolean flag
- Set to FALSE when Google Places enrichment succeeds during initial search
- Set to TRUE only when enrichment fails (no google_place_id returned)
- Background worker processes resources with this flag for retry attempts
- Most resources have FALSE after initial search (enrichment happens once)

**enrichment_failure_count**: Integer
- Increments each failed enrichment attempt
- Hard limit: 3 failures = stop retrying
- Checked before fetching from queue

**enrichment_failure_reason**: Text
- "Permanently closed" → Mark exportable=false
- Network errors, timeouts
- "No results found" → Keep but stop retrying

**exportable**: Boolean
- Initially FALSE (requires explicit validation)
- Set TRUE when resource passes validation
- Set FALSE when:
  - marked_permanently_closed=true
  - Jina validation says NOT a food resource
  - URL validation returns no food keywords
  - Bulk action marks as unexportable

**last_verified_at**: Timestamp
- Updated when Jina validation completes
- Updated when enrichment successful
- Tracks data freshness

---

## Part 5: Status & Monitoring Capabilities

### County Processing Status (`/status/counties`)

Shows progress across all 3,222 US counties:
```json
{
  "total": 3222,
  "searched": 147,
  "pending": 3075,
  "by_state": {
    "CA": {"total": 58, "searched": 23, "pending": 35},
    "TX": {"total": 254, "searched": 0, "pending": 254},
    ...
  }
}
```

### Enrichment Status (`/status/enrichment`)

Shows background enrichment queue state:
```json
{
  "pending": 2341,        // Resources needing enrichment
  "failed": 156,          // Failed 1+ times
  "permanently_failed": 23 // Failed 3+ times (give up)
}
```

### Unprocessed Counties (`/status/unprocessed?state=CA`)

List of counties not yet searched:
```json
{
  "unprocessed": [
    {"state": "CA", "county_name": "Alameda County", "geoid": "06001"},
    {"state": "CA", "county_name": "Alpine County", "geoid": "06003"}
  ]
}
```

### Analysis Dashboard (`/analyze-ui`)

Interactive web interface for:
- Filtering by state, type, suspicion score, category
- Real-time table of suspicious resources
- One-click actions: Delete, Validate, Re-enrich, Expand Directory
- Progress indicators and toast notifications

### Analyze Resources API (`/analyze-resources`)

Query suspicious resources:
```
GET /analyze-resources?state=CA&type=bank&min_suspicion=60&category=financial_bank
```

Returns:
```json
{
  "summary": [
    {
      "category": "financial_bank",
      "count": 15,
      "avg_suspicion": 75.3
    }
  ],
  "total_analyzed": 1234,
  "suspicious_count": 45,
  "resources": [
    {
      "id": 123,
      "name": "Community Bank",
      "type": "bank",
      "suspicion": {
        "score": 80,
        "reasons": ["Contains financial institution keywords"],
        "category": "financial_bank"
      }
    }
  ]
}
```

---

## Part 6: Automation Scripts

Located in `/scripts/` directory (37 scripts):

### Data Quality Scripts

- `validate-with-jina.ts` - Validates/updates resource data
- `retry-missing-geocoding.ts` - Fixes missing coordinates
- `check-missing-geocoding.ts` - Identifies gaps
- `analyze-data-quality.ts` - Quality metrics
- `mark-exportable.ts` - Bulk export validation

### Data Cleanup Scripts

- `remove-permanently-closed.ts` - Remove closed locations
- `remove-law-enforcement.ts` - Filter false positives
- `cleanup-database.ts` - General cleanup
- `reset-database.ts` - Complete reset
- `cleanup-government-offices.ts` - Remove gov't false positives

### Enrichment Scripts

- `enrich-missing.ts` - Fill gaps in existing data
- `retry-failed-enrichments.ts` - Retry failed enrichments
- `backfill-social-media.ts` - Add social media links

### Testing & Debugging Scripts

- `test-full-county-search.ts` - End-to-end county search
- `test-jina-search.ts` - Jina API testing
- `test-geocoding-fallback.ts` - Coordinate validation
- `test-church-school-blocking.ts` - False positive filter testing
- `test-google-places-search.ts` - Google Places API testing

### County/State Processing

- `rerun-counties-with-jina.ts` - Reprocess with Jina search
- `run-county-jina.ts` - Single county Jina search
- `mark-permanently-closed-unexportable.ts` - Bulk unexport closed sites

---

## Part 7: Key AI/ML Patterns & Techniques

### Pattern 1: Multi-Source Corroboration

The system doesn't rely on a single data source:

```
OpenAI search → Find candidates
    ↓
Google Places → Verify existence
    ↓
Jina content fetch → Validate details
    ↓
Keyword analysis → Check legitimacy
    ↓
Heuristic scoring → Final judgment
```

**Benefit**: False positives caught at multiple stages

### Pattern 2: Confidence-Based Filtering

Different confidence levels trigger different actions:

```
100% confident food resource
  → immediate insertion, skip validation

50-75% confidence
  → inserted, marked for Jina validation
  
0-50% confidence
  → rejected, logged for manual review
  
Negative matches (e.g., "definitely a bank")
  → never inserted, logged as false positive caught
```

### Pattern 3: Incremental Validation

Resources are validated progressively:

```
STAGE 1: Initial discovery (OpenAI)
  - Name, address, type extracted
  - Basic verification that it's open

STAGE 2: Geographic verification (Google Places)
  - Confirm coordinates
  - Validate address
  - Check business status

STAGE 3: Content validation (Jina)
  - Fetch website content
  - Extract detailed data
  - Confidence assessment
  - Update with fresh information

STAGE 4: Final export validation (URL check)
  - Verify source URL still works
  - Confirm content still mentions food

Each stage can surface false positives and flag for removal
```

### Pattern 4: LLM as Structured Extractor

OpenAI's JSON schema responses are used for:

```typescript
// Instead of: "tell me about this resource"
// Use: "extract only these specific fields in this JSON format"

response_format: {
  type: "json_schema",
  json_schema: {
    name: "food_resource_extraction",
    strict: true,  // Enforce schema strictly
    schema: {
      type: "object",
      properties: {
        name: {type: ["string", "null"]},
        address: {type: ["string", "null"]},
        ...
      },
      required: [...],
      additionalProperties: false
    }
  }
}

// Benefits:
// - Deterministic parsing (no markdown, no extra fields)
// - Type safety (errors if fields wrong)
// - Handles nulls properly
// - Temperature=0 for reproducibility
```

### Pattern 5: Rate Limiting & Concurrency

```typescript
// Google Places: 100-200ms delay between requests
// OpenAI: Sequential requests with 500ms delays
// Jina: 25 concurrent batches (respects API limits)
// Database: Connection pooling

// Prevents:
// - API quota exhaustion
// - Database connection pool overload
// - Rate limit hits
// - Cost explosion
```

### Pattern 6: Error Resilience

```typescript
// Graceful degradation:
// - No Google Places API? Use original data + enrichment=false
// - No Jina API key? Use free tier (20 req/min)
// - OpenAI fails? Log to failed-responses.log + retry later
// - Network timeout? Increment failure count + try again

// Idempotency:
// - Duplicate addresses detected + skipped
// - Duplicate URLs deduplicated
// - County searches tracked → prevents reprocessing
// - With --force flag can reprocess if needed
```

---

## Part 8: Performance & Scalability Characteristics

### Search Performance

| Operation | Typical Duration | Notes |
|-----------|------------------|-------|
| OpenAI web search (1 location) | 15-30s | Includes web crawl time |
| Google Places search (1 county) | 5-10s | Multiple queries |
| Single resource enrichment | 2-5s | API calls + DB update |
| Jina content fetch | 1-3s | Website content retrieval |
| Full county search (30 results) | 2-3 min | Combined searches + enrichment |

### Throughput

- **Enrichment worker**: 5 concurrent, ~5-10 resources/min = 300-600/hour
- **Jina validation**: 25 concurrent, ~500-700 resources/hour (with API key)
- **County processing**: ~3-4 counties/min (each county ~1-3 min search)
- **Bulk URL validation**: ~10 concurrent, 60 URLs/min

### Database Characteristics

- **Resources table**: Can handle 100k+ records
- **Indexes on**: zip_code, county_geoid, location, location_type
- **Typical query**: <100ms for filtered queries
- **Connection pool**: 10 concurrent connections (tunable)

### Cost Implications

| Component | Est. Cost | Volume |
|-----------|-----------|--------|
| OpenAI searches | $0.02-0.05/county | 3,222 counties |
| Google Places | Free-$0.10/call | ~1 per resource |
| Jina (50-100/hour) | Free tier or $20/month | As needed |
| PostgreSQL | Self-hosted or managed | ~1GB for 100k resources |

**Total monthly estimate**: $50-200 (depending on validation frequency)

---

## Part 9: Security & Data Handling

### Input Validation

- Zip codes: 5-digit regex validation
- County names: Exact match against Census data
- State codes: 2-letter uppercase
- URLs: Basic HTTPS checks, timeout protection

### Rate Limiting

- API endpoints: Per-request rate limiting (future)
- Background worker: Staggered processing with delays
- External APIs: Respect published rate limits

### Data Privacy

- No personal user data collected
- Source URLs public information
- Database connection: SSL/TLS encryption
- API keys: Environment variables only

### Error Handling

- Sensitive errors logged server-side only
- Generic errors returned to clients
- Failed responses logged for debugging
- No credentials in error messages

---

## Part 10: Development & Testing

### Testing Infrastructure

- `api.test.ts` - API endpoint testing
- `search.test.ts` - Search functionality testing
- `openai-search.test.ts` - AI search validation
- `enrichment-worker.test.ts` - Background processing
- `source-filter.test.ts` - Source filtering logic

### Running Tests

```bash
bun test                    # Run all tests
bun test api.test.ts       # Run specific test file
bun test --watch          # Watch mode
```

### Development Server

```bash
bun --hot src/index.ts    # Auto-reload on changes
# Server runs on http://localhost:3000
```

### Local Testing Tools

```bash
# Check database state
bun scripts/check-db.ts

# Test specific searches
bun scripts/test-full-county-search.ts

# Test Jina integration
bun scripts/test-jina-search.ts
```

---

## Summary: Key Takeaways for Teams New to AI

### 1. **Layered Validation**
This system doesn't trust any single data source. It validates through multiple independent layers (search, location, content, keywords). This is the key to high-quality results.

### 2. **AI as Structured Processor**
OpenAI and Jina aren't used as "magic" - they're used as structured processors with strict schemas, low temperatures, and specific prompts. The system treats them like APIs, not like black boxes.

### 3. **Human-in-the-Loop Tools**
The system provides tools (/analyze-ui, false-positive-detector) to let humans review and fix issues quickly. It's not 100% automated - it's designed to be human-friendly.

### 4. **Fail-Graceful Design**
Missing APIs, network errors, rate limits - the system degrades gracefully and logs issues for later review. It doesn't crash; it works around problems.

### 5. **Cost Optimization**
By combining free APIs (Google Places discovery) with premium services (Jina for validation), the system balances cost and quality. Caching and deduplication prevent wasted API calls.

### 6. **Scale Through Batching**
Processing 3,222 counties isn't done all at once. It's split into batches, counties are tracked as complete, and work is parallelized where possible (but rate-limited where needed).

### 7. **Data Quality Through Iteration**
The system doesn't expect to be perfect on first run. It provides scripts and endpoints to identify and fix issues incrementally. "Mark unexportable," "re-enrich," "expand directory" are core operations.

This represents a pragmatic, production-ready approach to AI-powered data collection that prioritizes reliability, cost-effectiveness, and user control.

# Quick Start: AI Integration in Pantry Search

## What This System Does

Pantry Search systematically finds and validates food pantries/banks across all 3,222 US counties using AI and APIs.

## The AI Pipeline (Simplified)

```
User Request (zip or county)
        ↓
OpenAI Web Search (finds 20-30+ candidates)
        ↓
Google Places (verifies they exist + location)
        ↓
Jina AI (fetches website content for details)
        ↓
False Positive Filter (heuristic scoring)
        ↓
Database Storage (with quality flags)
        ↓
Human Review Interface (/analyze-ui)
        ↓
Export (clean data)
```

## Three AI/API Integrations

### 1. OpenAI (Discovery & Expansion)

**What it does:**
- Searches the web for food resources using natural language
- Follows directory links to find lists of locations
- Extracts structured data from websites
- Validates resources aren't false positives

**Key files:**
- `src/openai-search.ts` - Web search
- `src/directory-expander.ts` - Breaking up listings
- `src/ai-validator.ts` - Quick validation

**Cost:** ~$0.02-0.05 per county search

**Speed:** 15-30 seconds per search

### 2. Google Places (Verification)

**What it does:**
- Confirms location exists
- Gets precise latitude/longitude
- Checks phone, hours, rating
- Checks if permanently closed

**Key files:**
- `src/google-places.ts` - Enrichment
- `src/google-places-search.ts` - Discovery

**Cost:** Free for basic use (paid for high volume)

### 3. Jina AI (Content Extraction)

**What it does:**
- Fetches website content as clean markdown
- Extracts hours, phone, services, eligibility
- Updates database with fresh info
- Validates resources still exist

**Key files:**
- `src/validate-with-jina.ts` - Main validation script
- `src/jina-search.ts` - Search integration

**Cost:** Free tier (20 req/min) or paid ($20/month+)

**Smart Feature:** 
- Each run validates *different* resources (no duplication)
- Prioritizes never-before-validated resources first
- Then cycles through oldest validations

## How to Use

### 1. Search by Zip Code (Uses OpenAI + Google)

```bash
curl "http://localhost:3000/search?zip=94102"
```

Response: Organized pantries, banks, mixed by type + cache status

### 2. Search by County (Uses OpenAI + Google)

```bash
curl "http://localhost:3000/search-county?county=San%20Francisco%20County&state=CA"
```

### 3. Search by County with Jina (Uses Jina Search API)

```bash
curl -X POST "http://localhost:3000/search-county-jina?county=San%20Francisco%20County&state=CA"
```

### 4. Validate/Update Data (Batch CLI)

```bash
# Validate 50 resources with Jina (gets fresh website data)
bun src/validate-with-jina.ts 50 CA

# Output:
# Total processed: 50
# Updated: 23 (got better data)
# Marked unexportable: 4 (no longer valid)
# No change: 23 (already has good data)
```

### 5. Process All Counties Systematically

```bash
# California only, 10 counties per batch
bun src/process-counties.ts --state=CA --batch-size=10

# Reprocess all states (skip already-done counties)
bun src/process-counties.ts

# Force reprocess even if already done
bun src/process-counties.ts --force
```

### 6. Find & Fix False Positives

```bash
# Interactive UI for finding suspicious entries
# Go to: http://localhost:3000/analyze-ui

# Or via API:
curl "http://localhost:3000/analyze-resources?state=CA&type=bank&min_suspicion=60"
```

## Key Workflows

### Workflow A: New County Search

1. API receives request for county
2. OpenAI searches web → finds 30 candidates
3. For each candidate, Google Places enrichment (single pass):
   - Text Search: Verify location exists
   - Place Details: Get hours, phone, rating, website, accessibility
   - Social media extraction
4. Results stored:
   - If enrichment succeeded (has google_place_id) → `needs_enrichment=false`
   - If enrichment failed (no google_place_id) → `needs_enrichment=true`
5. Background worker only picks up failed enrichments for retry
6. Updates database with all enriched details

**Note:** No duplicate API calls - enrichment happens once during initial search

### Workflow B: Data Validation Loop

1. Run Jina validation script
2. Fetches website content for each resource
3. LLM extracts: hours, phone, services, eligibility
4. Compares with database (only updates if better)
5. Marks as "unexportable" if website says it's not a food resource
6. Each run processes different resources (smart batching)

### Workflow C: Quality Assurance

1. Heuristic scoring flags suspicious entries:
   - Name contains "Bank of America" → financial bank (score: 85)
   - URL has "/directory/" → listing page (score: 75)
   - No phone/hours → unclear (score: 40)
2. Send suspicious ones for AI validation
3. Or expand directory to extract individual locations
4. Delete confirmed false positives
5. Re-enrich borderline cases

## Database State Tracking

### Key Fields That Matter

**needs_enrichment**: 
- TRUE = background worker should process this
- FALSE = already enriched, no need to reprocess

**enrichment_failure_count**:
- 0 = never tried
- 1-2 = tried but failed (will retry)
- 3+ = gave up (won't retry)

**enrichment_failure_reason**:
- "Permanently closed" → mark as unexportable
- "No results found" → keep but don't retry
- Network errors → will retry later

**exportable**:
- FALSE = don't include in exports (default)
- TRUE = has passed validation, safe to export

**last_verified_at**:
- Timestamp when Jina validation last ran
- Older = more stale, good candidate for revalidation

## Monitoring Progress

```bash
# Overall status across all 3,222 counties
curl http://localhost:3000/status/counties
# {total: 3222, searched: 147, pending: 3075, by_state: {...}}

# Enrichment queue status
curl http://localhost:3000/status/enrichment
# {pending: 2341, failed: 156, permanently_failed: 23}

# Which counties haven't been searched yet
curl http://localhost:3000/status/unprocessed?state=CA
# List of unprocessed counties
```

## Cost Breakdown

Assuming full coverage (3,222 counties):

| Component | Per Unit | Total | Notes |
|-----------|----------|-------|-------|
| OpenAI searches | $0.03 | $96 | One per county |
| Google Places | Free | $0 | Usually free tier |
| Jina validation | Free/month | $0-20 | 20 req/min free, $20/mo for premium |
| Database | Self-hosted | $0 | Or Postgres managed ~$15/mo |
| **Total** | | **$96-116/mo** | One-time setup |

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Zip search | 30-60s | Cache helps |
| County search | 2-3 min | Multiple sources |
| Jina validation (50 resources) | 3-5 min | 25 concurrent |
| Full county processing | 1-3 min per county | Systematic approach |
| Bulk URL validation | 1 min per 100 URLs | 10 concurrent |

## Common Patterns You'll See

### Pattern 1: Markdown Code Block Handling
LLMs sometimes wrap JSON in markdown. The code handles this:
```typescript
// Remove ```json ... ``` if present
// Falls back to raw JSON extraction
// If still broken, attempts to fix truncated JSON
```

### Pattern 2: Smart De-duplication
Same resource found in multiple searches? Caught by:
- Address normalization (case-insensitive, extra spaces)
- URL deduplication (case-insensitive)
- Google Place ID matching

### Pattern 3: Confidence Scoring
Not "is this food?" but "how suspicious is this?"
- Financial bank keywords = +85 to suspicion
- Food pantry keywords = -50 from suspicion
- Result: 0-100 score, human reviews borderline cases

### Pattern 4: Batch Smart Processing
Rather than round-robin, system:
- Prioritizes: never-validated > oldest-validated
- Uses pagination to avoid duplicates
- Rate limits based on API quotas

## Debugging

### If Jina validation isn't working:

```bash
# Check if API key is set
echo $JINA_API_KEY

# Test Jina Reader directly
curl https://r.jina.ai/https://example.com
```

### If Google Places enrichment is slow:

Check `enrichment_failure_count` in database:
```bash
# SQL
SELECT COUNT(*), enrichment_failure_reason 
FROM resources 
GROUP BY enrichment_failure_reason;
```

Failed locations won't be retried.

### If OpenAI search times out:

```bash
# Check failed-responses.log
tail -100 failed-responses.log

# Logs malformed responses for manual review
```

## Next Steps for Your Team

1. **Understand the flow**: Each resource goes through 3-4 AI stages
2. **Start small**: Test with one county before processing all 3,222
3. **Monitor quality**: Use /analyze-ui to spot issues early
4. **Validate incrementally**: Don't try to perfect everything at once
5. **Leverage scripts**: 37 scripts solve common problems

The system is built for *iteration* - it gets better each time you run validation scripts.


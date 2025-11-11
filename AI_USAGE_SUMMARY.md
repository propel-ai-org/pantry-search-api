# Pantry Search: AI Usage Summary

## Why AI is Essential Here

This application finds and validates food resources across 3,222 counties. Without AI, it would require:
- Manual research for each county (impossible at scale)
- Manual verification of each location (thousands of phone calls)
- Manual data extraction from websites (prohibitively slow)
- Manual filtering of false positives (tedious and error-prone)

AI makes systematic national coverage feasible.

## Where AI is Used (3 Places)

### 1. DISCOVERY: OpenAI Web Search

**Problem it solves:** How do you find food pantries in a county you've never researched?

**Solution:** Use GPT-4o-mini with web search to:
- Find 20-30+ food resources per county
- Follow links to directory pages
- Extract structured data (name, address, phone, hours)
- Quickly identify false positives

**Impact:** Finds resources that don't exist in Google Places and isn't in any single directory

**Cost:** $0.02-0.05 per county search = ~$96 for full coverage

**Limitations:** 
- Sometimes finds false positives (financial banks, schools)
- Takes 15-30 seconds per search
- Occasional JSON formatting issues

---

### 2. VERIFICATION: Google Places API

**Problem it solves:** How do you verify a location actually exists and get accurate coordinates?

**Solution:** Use Google Places to:
- Confirm the location exists in Google's database
- Get precise latitude/longitude
- Retrieve accurate phone numbers
- Extract hours, ratings, accessibility features
- Check if permanently closed

**Impact:** Eliminates false addresses, gets canonical data, detects closed locations

**Cost:** Free for basic use (up to 1,000 searches/day)

**Limitations:** 
- Sometimes returns wrong location (same name, different city)
- Requires accurate initial address/name
- Takes 2-5 seconds per location

---

### 3. VALIDATION: Jina AI Web Scraping

**Problem it solves:** How do you keep data fresh and extract details not in Google Places?

**Solution:** Use Jina to:
- Fetch website content from source_url
- Smart LLM link selection to find Hours/Contact pages
- Extract: phone, hours, services, eligibility requirements
- Validate it's actually a food resource
- Update database with fresh information

**Impact:** Continuously improves data quality, catches resources that closed, updates stale info

**Cost:** Free tier (20 req/min) or $20/month for higher limits

**Performance:** 500-700 resources/hour with API key

---

## The AI-Powered Workflow

```
┌─────────────────────┐
│ User: Search Zip    │
│ or County           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ OpenAI: Search web for food resources   │
│ • Find 20-30+ candidates                │
│ • Follow directory links                │
│ • Extract name, address, phone          │
│ • Identify obvious false positives      │
└──────────┬──────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Google Places: Verify each one       │
│ • Does it actually exist?            │
│ • Get precise coordinates            │
│ • Fetch phone, hours, rating         │
│ • Check if permanently closed        │
└──────────┬───────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Heuristic Scoring: Catch false +ves   │
│ • Financial bank keywords? → Score 85 │
│ • Directory page? → Score 75          │
│ • Food pantry keywords? → Score -50   │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Database Storage                       │
│ • If enrichment succeeded:             │
│   needs_enrichment=false (done!)       │
│ • If enrichment failed:                │
│   needs_enrichment=true (retry)        │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Background Worker (Continuous)        │
│ • Only processes failed enrichments    │
│ • Retries Google Places enrichment     │
│ • Sets needs_enrichment=false on success │
│ • Most resources skip this step        │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Jina Validation (On-Demand Script)    │
│ • Fetch actual website content         │
│ • LLM extracts detailed info           │
│ • Validates it's a food resource       │
│ • Updates DB only if better data      │
│ • Marks as unexportable if not food   │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Human Review (/analyze-ui)            │
│ • See all suspicious entries           │
│ • One-click actions to delete/validate │
│ • Drill down on false positives        │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ Export Clean Data                      │
│ • Only exportable=true resources       │
│ • Rich data: hours, phone, website     │
│ • Verified addresses & coordinates     │
└────────────────────────────────────────┘
```

## Key AI Decisions & Tradeoffs

### Decision 1: Multiple Sources vs Single Source

**What we do:** Use OpenAI + Google Places + Jina together

**Why:** Single source misses resources
- Google Places: Excellent for verified locations, misses small pantries
- OpenAI: Broad search, finds everything, more false positives
- Jina: Validates by checking actual websites

**Result:** Comprehensive with layered quality checks

**Tradeoff:** More expensive, slower, more complex

---

### Decision 2: Heuristic Scoring vs AI Validation for All

**What we do:** Use pattern matching to flag suspicious entries, AI only validates borderline cases

**Why:** 
- Pattern matching is fast and cheap (instant, no API call)
- Obvious false positives caught immediately
- AI reserved for uncertain cases (conserve API budget)

**Result:** Clear false positives removed fast, borderline cases get human attention

**Tradeoff:** Some real food resources might have suspicious names (requires human review)

---

### Decision 3: Structured Extraction vs Free-form LLM

**What we do:** Use JSON schema for all LLM extraction requests

**Why:**
- Prevents markdown wrapping nonsense
- Type-safe (errors if format wrong)
- Temperature=0 for reproducibility
- Can be automatically parsed

**Result:** Reliable extraction, can fully automate processing

**Tradeoff:** Takes longer to specify schema (better upfront design)

---

### Decision 4: Batch Processing vs Real-Time All

**What we do:** Real-time search API, but Jina validation runs as scheduled batch jobs

**Why:**
- User searches need fast response (real-time)
- Data validation is ongoing maintenance (batch is fine)
- Batch processing respects API rate limits
- Can process 500+ resources/hour if needed

**Result:** Fast user experience, efficient API usage

**Tradeoff:** Data takes time to be fully validated (not instant)

---

## Key Numbers

| Component | Cost | Speed | Coverage |
|-----------|------|-------|----------|
| Full county search (OpenAI + Google) | $0.05 | 2-3 min | 1 county = ~20-50 resources |
| Jina validation batch (50 resources) | Free-0.40 | 3-5 min | 500+ resources/hour possible |
| Database background enrichment | $0 | continuous | All resources eventually |
| Interactive false-positive review | $0 | instant | Any subset of resources |

**Estimated monthly cost for national coverage:**
- OpenAI: $96 (3,222 counties × $0.03)
- Google Places: $0-50 (free tier usually sufficient)
- Jina: $0-20 (free tier or modest paid tier)
- Database: $0-20 (self-hosted or cheap managed)
- **Total: $96-186/month** (very cheap for national food resource database)

---

## What Each LLM Model Does

### GPT-4o-mini

Used for:
- Web search (with tools)
- Data extraction
- Validation/confidence assessment
- Directory expansion
- Prompt: Specific instructions, JSON schema output, temperature=0

**Cost:** Cheapest model, fast, good enough for structured tasks
**Speed:** 1-3 seconds per request
**Quality:** Very high for extraction, occasionally makes mistakes on context

### Why Not Other Models?

- GPT-4: Too expensive ($0.15 vs $0.02), not needed for extraction
- Claude: Not available in this codebase, but would work similarly
- Local LLM: Not viable (too slow for real-time)

---

## Failure Handling

The system is designed to fail gracefully:

**If OpenAI API fails:**
- Logged to failed-responses.log
- User gets error
- Manual retry possible

**If Google Places fails:**
- Use original data from OpenAI search
- Mark with enrichment_failure_reason
- Try again later (max 3 attempts)

**If Jina fails:**
- Keep existing data
- Mark as unexportable if website truly gone
- Move on to next resource

**If Network timeout:**
- Automatically retry with exponential backoff
- Never silently fail

**If API quota hit:**
- Rate limiting prevents quota exhaustion
- System pauses and retries
- Logs warnings

---

## When to Use Which AI Tool

**Use OpenAI when you need to:**
- Find resources in an area (web search)
- Extract data from websites (general scraping)
- Validate if something is a food resource
- Break apart directory pages

**Use Google Places when you need to:**
- Verify a location exists
- Get precise coordinates
- Get current hours/phone
- Check if permanently closed
- Get accessibility info

**Use Jina when you need to:**
- Get fresh data from a website
- Validate against latest website content
- Extract detailed structured data
- Confirm resource still operates

---

## For New Team Members

### What to Know About This System

1. **It's not magic:** Each AI tool has specific use cases and limitations
2. **Layered validation:** Multiple sources catch false positives
3. **Human-in-the-loop:** The /analyze-ui interface is not optional
4. **Iterative improvement:** Each validation run makes the database better
5. **Cost-conscious:** Uses cheapest APIs for each task, respects rate limits

### What to Watch Out For

1. **LLM hallucinations:** The system can invent data if not strictly constrained
   - Solution: Use JSON schema output format
   - Solution: Use temperature=0
   - Solution: Require concrete evidence

2. **False positives:** Financial banks, schools, churches still slip through
   - Solution: Heuristic scoring catches 90% of obvious cases
   - Solution: Human review catches the rest

3. **Geographic filtering:** Hard to distinguish regional vs local orgs
   - Solution: Check city in address matches expected location
   - Solution: Reject known major cities (LA, NYC, etc.) when searching elsewhere

4. **Rate limiting:** APIs have quotas and will return errors if exceeded
   - Solution: Built-in delays between requests
   - Solution: Batch processing respects limits
   - Solution: Fallback to free tier if needed

### How to Debug Issues

```bash
# Check if API keys are configured
echo $OPENAI_API_KEY
echo $GOOGLE_MAPS_API_KEY
echo $JINA_API_KEY

# Look at OpenAI failures
tail -100 failed-responses.log

# Check database state
bun scripts/check-db.ts

# Monitor enrichment queue
curl http://localhost:3000/status/enrichment

# Find suspicious resources
curl http://localhost:3000/analyze-resources?state=CA&min_suspicion=70
```

---

## Conclusion

This system demonstrates **pragmatic AI usage**:

- Not 100% AI-reliant (uses human review)
- Not 0% AI (would be impossible at scale)
- Right tool for each job (OpenAI, Google, Jina)
- Cost-effective ($100-200/month for national coverage)
- Iterative (gets better each time)
- Verifiable (can audit each decision)

It's a good model for teams building data systems with AI.

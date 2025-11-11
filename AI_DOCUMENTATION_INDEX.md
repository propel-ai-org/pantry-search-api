# AI Documentation Index - Pantry Search

This directory now contains comprehensive documentation on how Pantry Search uses AI/LLMs to discover, validate, and maintain food resource data.

## Quick Navigation

**First time here?** Start with: `EXPLORATION_SUMMARY.md` (5 min read)

**Teaching team members?** Use: `QUICK_START_AI.md` + `AI_USAGE_SUMMARY.md` (30 min)

**Deep technical dive?** Read: `ARCHITECTURE.md` (reference-style)

**Making architectural decisions?** See: `AI_USAGE_SUMMARY.md` → "Key AI Decisions & Tradeoffs"

---

## Documentation Files

### 1. EXPLORATION_SUMMARY.md (Start Here!)
**Length:** 5-10 min read
**Audience:** Everyone

Entry point to the documentation suite. Explains:
- What Pantry Search is and does
- Overview of the 3 documentation files
- Key findings and architecture patterns
- System statistics
- How to use these documents effectively

**Best for:** Getting oriented, understanding scope, planning how to approach learning this system

---

### 2. QUICK_START_AI.md (Practical Guide)
**Length:** 15-20 min read
**Audience:** Developers, team members new to AI

The hands-on guide. Shows:
- The AI pipeline (visual diagram)
- Three AI integrations (what they each do)
- How to use each endpoint (actual curl examples)
- Three key workflows with step-by-step explanation
- Database state fields that matter
- Monitoring commands to check progress
- Cost breakdown and performance expectations
- Common patterns you'll see in the code
- Debugging checklist

**Best for:** Understanding "how do I actually use this?" and getting hands-on quickly

**Key sections:**
- AI Pipeline (visual flow)
- How to Use (6 concrete examples)
- Cost Breakdown (real numbers)

---

### 3. AI_USAGE_SUMMARY.md (Learning & Decisions)
**Length:** 20-25 min read
**Audience:** Architects, team leads, ML engineers, anyone making technology decisions

The "why" behind the implementation. Covers:
- Why AI is essential for this problem
- What each of 3 AI tools does (OpenAI, Google Places, Jina)
- 4 major architectural decisions and their tradeoffs
  - Multiple sources vs single source
  - Heuristic vs AI validation
  - Structured vs free-form extraction
  - Batch vs real-time processing
- Cost/speed/coverage analysis
- Why GPT-4o-mini (not GPT-4)
- Error handling and graceful degradation
- When to use which tool
- Common pitfalls for new teams
- Debugging checklist

**Best for:** Understanding design decisions, learning from this project's experience, training ML engineers

**Key sections:**
- Key AI Decisions & Tradeoffs
- When to Use Which AI Tool
- For New Team Members (pitfalls to watch)

---

### 4. ARCHITECTURE.md (Technical Reference)
**Length:** 30-40 min full read (use as reference)
**Audience:** Developers, technical architects, engineers implementing changes

Comprehensive technical documentation. Contains:

**Part 1:** Overall Architecture
- High-level system design
- Core entry points and modules

**Part 2:** AI Integration Deep Dive (most important)
- OpenAI: Web search, validation, directory expansion
- Jina AI: Search and validation strategies
- Google Places: Verification and enrichment
- Each with detailed code flow and use cases

**Part 3:** Data Flow & Workflows
- Workflow 1: Zip code search
- Workflow 2: County search
- Workflow 3: County processing (batch CLI)
- Workflow 4: Jina validation & updating
- Workflow 5: False positive detection
- Workflow 6: Bulk URL validation

**Part 4:** Database Schema
- All 3 tables with full schema
- Key state fields explained

**Part 5:** Status & Monitoring
- All endpoints with examples
- What each response means

**Part 6:** Automation Scripts
- All 37 scripts listed and categorized

**Part 7:** AI/ML Patterns
- 6 key patterns used throughout

**Part 8-10:** Performance, Security, Development

**Best for:** Understanding "how does this all fit together?" and making technical changes

**Use as:** Reference - read relevant sections when needed, not necessarily front-to-back

---

## The System in One Diagram

```
User Request
    ↓
OpenAI Web Search (finds 20-30+ candidates)
    ↓
Google Places API (verifies + enriches)
    ↓
Heuristic Scoring (catches obvious false positives)
    ↓
Database Storage (mark for background processing)
    ↓
Background Worker (continuous improvement)
    ↓
Jina AI Validation (keep data fresh, catch new failures)
    ↓
Human Review Interface (/analyze-ui)
    ↓
Export Clean Data
```

---

## Key Concepts to Understand

### Three AI Tools Working Together

1. **OpenAI (GPT-4o-mini)**: Discovery
   - Web search to find resources
   - Extracts structured data
   - Validates suspicious entries

2. **Google Places API**: Verification
   - Confirms location exists
   - Gets precise coordinates
   - Checks if permanently closed
   - Finds accessibility features

3. **Jina AI**: Validation
   - Fetches actual website content
   - Extracts current hours, phone, services
   - Validates "is this a food resource?"
   - Updates database with fresh info

### Key Innovation: Smart Batching

The Jina validation script doesn't process resources in random order. Instead:
1. **First run:** Process all never-validated resources
2. **Second run:** Process oldest-validated resources first
3. **Result:** Every run validates different resources, no wasted duplicate work

This is how 500+ resources/hour validation throughput is achieved.

### Key Innovation: Heuristic Scoring

Before asking AI "is this a food resource?", use pattern matching:
- Name contains "Bank of America" → +85 suspicion (financial bank)
- URL has "/directory/" → +75 suspicion (listing page)
- Name contains "food pantry" → -50 suspicion

Result: 90% of obvious false positives caught instantly, no API calls.

### Key Innovation: Structured Extraction

Instead of "tell me about this food pantry", use:
```json
{
  "type": "json_schema",
  "schema": {
    "properties": {
      "is_food_resource": {"type": "boolean"},
      "phone": {"type": ["string", "null"]},
      "hours": {"type": ["string", "null"]}
    }
  }
}
```

Result: No markdown wrapping, type-safe, deterministic output.

---

## Reading Paths by Role

### For Team Lead / Architect
1. EXPLORATION_SUMMARY.md (overview)
2. AI_USAGE_SUMMARY.md (decisions & tradeoffs)
3. ARCHITECTURE.md Part 2 (AI integration)
4. ARCHITECTURE.md Part 8-10 (perf & security)

Time: ~60 minutes

### For Backend Developer
1. QUICK_START_AI.md (practical guide)
2. ARCHITECTURE.md Part 1-3 (system design & workflows)
3. ARCHITECTURE.md Part 4 (database)
4. ARCHITECTURE.md Part 7 (patterns)

Time: ~90 minutes

### For ML Engineer / AI Specialist
1. AI_USAGE_SUMMARY.md (decisions & when to use which tool)
2. ARCHITECTURE.md Part 2 (AI integration deep dive)
3. QUICK_START_AI.md Section "Common Patterns"
4. ARCHITECTURE.md Part 7 (AI/ML patterns)

Time: ~60 minutes

### For New Team Member (Any Role)
1. QUICK_START_AI.md (get hands-on quickly)
2. Run a test search to see it in action
3. EXPLORATION_SUMMARY.md (understand what you just saw)
4. Read role-specific path above

Time: ~120 minutes total

---

## Reference Information

### Source Files Referenced

The documentation discusses these key source modules:
- `src/index.ts` - Main API server
- `src/openai-search.ts` - OpenAI web search integration
- `src/google-places.ts` - Google Places enrichment
- `src/jina-search.ts` - Jina search API
- `src/validate-with-jina.ts` - Jina validation script
- `src/false-positive-detector.ts` - Heuristic scoring
- `src/enrichment-worker.ts` - Background processing
- `src/database.ts` - Database schema
- `src/process-counties.ts` - Batch county processing

### API Endpoints Covered

Search endpoints:
- `GET /search?zip={zipcode}`
- `GET /search-county?county={name}&state={code}`
- `POST /search-county-jina` (use Jina for search)

Management endpoints:
- `POST /expand-directory`
- `POST /bulk-actions` (delete/validate/re-enrich)
- `POST /bulk-validate-urls` (streaming)
- `POST /mark-exportable`
- `POST /update-url`

Monitoring endpoints:
- `GET /status/counties`
- `GET /status/counties/{state}`
- `GET /status/enrichment`
- `GET /status/unprocessed`
- `GET /analyze-resources`
- `GET /analyze-ui`

Export endpoints:
- `GET /export?state={code}`
- `GET /health`

### Scripts Available

37 automation scripts exist in `/scripts/` directory, organized by purpose:
- Data Quality (validate, update, enrich)
- Data Cleanup (remove false positives, reset)
- Testing & Debugging (test specific features)
- County Processing (batch operations)

All scripts referenced in ARCHITECTURE.md Part 6.

---

## Staying Current

As the system evolves:
1. ARCHITECTURE.md is the source of truth for system design
2. QUICK_START_AI.md can be updated with new endpoints
3. AI_USAGE_SUMMARY.md captures decision rationale (unlikely to change)
4. EXPLORATION_SUMMARY.md is a snapshot of the analysis

---

## Questions?

If documentation is unclear or missing:
1. Check ARCHITECTURE.md Part 7 (patterns and principles)
2. Look at related source files
3. Run example commands from QUICK_START_AI.md
4. Check /status/ endpoints to see current system state

All documentation is designed to be self-contained while pointing to relevant source code.


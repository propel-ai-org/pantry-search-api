# Pantry Search API

A comprehensive API to find food pantries and food banks by zip code or county, using OpenAI's web search and Google Places API to find, verify, and enrich resource information across all US counties.

## Features

- Search for food pantries and banks by zip code or county
- Automatic verification of resources (checks if they're currently operating)
- Google Places enrichment for accurate location data, hours, and contact information
- PostgreSQL caching to avoid redundant searches (30-day cache)
- Categorization by type (pantry, bank, or mixed)
- Background worker for automatic enrichment of discovered resources
- County-level processing for systematic coverage of all 3,222 US counties
- Monitoring endpoints to track processing progress

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file with required API keys:
```bash
cp .env.example .env
# Edit .env and add your API keys
```

Required environment variables:
- `OPENAI_API_KEY`: OpenAI API key (get from https://platform.openai.com/)
- `GOOGLE_MAPS_API_KEY`: Google Places API key (get from https://console.cloud.google.com/)
- `DATABASE_URL`: PostgreSQL connection string

3. Run the server:
```bash
bun src/index.ts
```

The server will start on `http://localhost:3000` and automatically begin the background enrichment worker.

## API Endpoints

### Search by Zip Code

```
GET /search?zip=<zipcode>
```

**Parameters:**
- `zip` (required): 5-digit US zip code

**Example:**
```bash
curl "http://localhost:3000/search?zip=94102"
```

### Search by County

```
GET /search-county?county=<county_name>&state=<state_code>
```

**Parameters:**
- `county` (required): County name (e.g., "San Francisco County")
- `state` (required): Two-letter state code (e.g., "CA")

**Example (local):**
```bash
curl "http://localhost:3000/search-county?county=San%20Francisco%20County&state=CA"
```

**Example (production):**
```bash
curl "https://pantry-search-api-701e9c1736c8.herokuapp.com/search-county?county=San%20Francisco%20County&state=CA"
```

**Response (both endpoints):**
```json
{
  "pantries": [
    {
      "id": 1,
      "name": "Example Food Pantry",
      "address": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zip_code": "12345",
      "latitude": 34.0522,
      "longitude": -118.2437,
      "type": "pantry",
      "phone": "(555) 123-4567",
      "hours": "Mon-Fri 9AM-5PM",
      "notes": "Serves families in need. Average wait time 30 minutes.",
      "is_verified": true,
      "verification_notes": "Verified via official website and recent reviews",
      "source_url": "https://example.com",
      "created_at": "2025-10-31T12:00:00.000Z"
    }
  ],
  "banks": [...],
  "mixed": [...],
  "cached": false,
  "search_timestamp": "2025-10-31T12:00:00.000Z"
}
```

### Monitoring Endpoints

#### Get Overall County Processing Status

```
GET /status/counties
```

Returns statistics about county processing progress across all 3,222 US counties.

**Example:**
```bash
curl "http://localhost:3000/status/counties"
```

**Response:**
```json
{
  "total": 3222,
  "searched": 6,
  "pending": 3216,
  "by_state": {
    "CA": { "total": 58, "searched": 2, "pending": 56 },
    "DE": { "total": 3, "searched": 3, "pending": 0 }
  }
}
```

#### Get State-Specific County Status

```
GET /status/counties/:state
```

Returns detailed information about counties in a specific state.

**Example:**
```bash
curl "http://localhost:3000/status/counties/CA"
```

#### Get Enrichment Status

```
GET /status/enrichment
```

Returns statistics about Google Places enrichment progress.

**Example:**
```bash
curl "http://localhost:3000/status/enrichment"
```

#### Get List of Unprocessed Counties

```
GET /status/unprocessed
```

Returns a list of all counties that haven't been processed yet.

**Example:**
```bash
curl "http://localhost:3000/status/unprocessed"
```

### Health Check

```
GET /health
```

Returns `{"status": "ok"}` when the server is running.

## County Processing

The county processor is a CLI tool that systematically searches for food resources across US counties.

### Run County Processor

```bash
# Process all counties in all states
bun src/process-counties.ts

# Process all counties in a specific state
bun src/process-counties.ts --state=CA

# Process with custom batch size (default is 5)
bun src/process-counties.ts --state=DE --batch-size=10

# Force reprocess counties that have already been searched
bun src/process-counties.ts --state=CA --force
```

**Flags:**
- `--state=XX`: Process only counties in the specified two-letter state code
- `--batch-size=N`: Number of counties to process before displaying progress (default: 5)
- `--force`: Reprocess counties even if they've already been searched

**Example output:**
```
Starting county processor...
Processing 3 counties in Delaware
Processed Kent County, DE - Found 45 resources
Processed New Castle County, DE - Found 38 resources
Processed Sussex County, DE - Found 0 resources
Progress: 3/3 counties completed
Processing complete!
Total counties processed: 3
```

## Utility Scripts

### Reset Database

Completely resets the database by dropping all tables and recreating them:

```bash
bun scripts/reset-database.ts
```

### Check Database

View current database statistics and sample data:

```bash
bun scripts/check-db.ts
```

### Cleanup Database

Remove old cached data or specific records:

```bash
bun scripts/cleanup-database.ts
```

## Database

The application uses PostgreSQL to store and cache search results. The database includes:
- **resources**: Food pantries and banks with location, contact, and enrichment data
- **county_searches**: Tracks which counties have been processed and when
- **zip_searches**: Tracks zip code searches (30-day cache)

The database connection is configured via the `DATABASE_URL` environment variable.

## Built With

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [OpenAI API](https://platform.openai.com/) - Web search for finding and verifying food resources
- [Google Places API](https://developers.google.com/maps/documentation/places/web-service) - Location verification and enrichment
- [PostgreSQL](https://www.postgresql.org/) - Production database
- [postgres.js](https://github.com/porsager/postgres) - PostgreSQL client for Node.js/Bun

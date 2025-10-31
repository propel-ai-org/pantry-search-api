# Pantry Search API

A simple API to find food pantries and food banks near a given zip code, using OpenAI's web search capability to find and verify resources.

## Features

- Search for food pantries and banks by zip code
- Automatic verification of resources (checks if they're currently operating)
- SQLite caching to avoid redundant searches (30-day cache)
- Categorization by type (pantry, bank, or mixed)
- Additional information like wait times, hours, and reviews when available

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file with your OpenAI API key:
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

To get an OpenAI API key:
- Go to https://platform.openai.com/
- Sign up or log in
- Navigate to API keys section
- Create a new API key
- Add the API key to your .env file

3. Run the server:
```bash
bun run index.ts
```

The server will start on `http://localhost:3000`

## API Endpoints

### Search for Food Resources

```
GET /search?zip=<zipcode>
```

**Parameters:**
- `zip` (required): 5-digit US zip code

**Response:**
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

### Health Check

```
GET /health
```

Returns `{"status": "ok"}` when the server is running.

## Example Usage

```bash
curl "http://localhost:3000/search?zip=94102"
```

## Database

The application uses SQLite to cache search results. The database file `pantry-search.db` will be created automatically on first run.

## Built With

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [OpenAI API](https://platform.openai.com/) - Web search for finding and verifying food resources
- SQLite - Local caching database

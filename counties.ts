// ABOUTME: US Counties data loader and utilities
// ABOUTME: Parses Census Bureau gazetteer file for county-level geographic searches

export interface County {
  state: string; // Two-letter state code (e.g., "CA")
  geoid: string; // Geographic identifier
  name: string; // County name (e.g., "Alameda County")
  latitude: number;
  longitude: number;
}

let countiesCache: County[] | null = null;

export async function loadCounties(): Promise<County[]> {
  if (countiesCache) {
    return countiesCache;
  }

  const file = Bun.file("./data/2024_Gaz_counties_national.txt");
  const text = await file.text();
  const lines = text.split("\n");

  const counties: County[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Tab-delimited: USPS	GEOID	ANSICODE	NAME	ALAND	AWATER	ALAND_SQMI	AWATER_SQMI	INTPTLAT	INTPTLONG
    const parts = line.split("\t");
    if (parts.length < 10) continue;

    const state = parts[0].trim();
    const geoid = parts[1].trim();
    const name = parts[3].trim();
    const latitude = parseFloat(parts[8].trim());
    const longitude = parseFloat(parts[9].trim());

    if (state && geoid && name && !isNaN(latitude) && !isNaN(longitude)) {
      counties.push({
        state,
        geoid,
        name,
        latitude,
        longitude,
      });
    }
  }

  countiesCache = counties;
  console.log(`Loaded ${counties.length} counties from Census data`);
  return counties;
}

export async function getCountiesByState(state: string): Promise<County[]> {
  const counties = await loadCounties();
  return counties.filter((c) => c.state === state.toUpperCase());
}

export async function findCounty(
  name: string,
  state: string
): Promise<County | null> {
  const counties = await loadCounties();
  const normalized = name.toLowerCase();
  return (
    counties.find(
      (c) =>
        c.state === state.toUpperCase() &&
        c.name.toLowerCase() === normalized
    ) || null
  );
}

export async function getAllCounties(): Promise<County[]> {
  return await loadCounties();
}

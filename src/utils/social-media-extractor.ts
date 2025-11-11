// ABOUTME: Extracts social media links from website HTML
// ABOUTME: Finds Facebook, Twitter, Instagram, and YouTube URLs

interface SocialMediaLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
}

export async function extractSocialMediaLinks(
  websiteUrl: string,
  resourceName?: string
): Promise<SocialMediaLinks> {
  if (!websiteUrl) {
    return {};
  }

  try {
    console.log(`  Fetching ${websiteUrl} for social media links...`);

    // Fetch the website with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PantrySearchBot/1.0)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`  ⚠️  Failed to fetch ${websiteUrl}: ${response.status}`);
      return {};
    }

    const html = await response.text();

    // Validate that the website mentions the organization name (skip for PDFs)
    const isPdf = websiteUrl.toLowerCase().endsWith('.pdf');
    if (resourceName && !isPdf && !validateWebsiteMatchesName(html, resourceName)) {
      console.log(`  ⚠️  Website doesn't mention "${resourceName}" - skipping social links`);
      return {};
    }

    // Extract social media URLs - find ALL matches, then filter
    const links: SocialMediaLinks = {};

    // Facebook - find all matches
    const fbMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)/gi);
    const fbUrls = Array.from(fbMatches).map(m => m[1]).filter(isValidSocialHandle);
    if (fbUrls.length > 0) {
      // Prefer the most common one, or the first valid one
      const bestFb = findMostCommon(fbUrls);
      links.facebook = normalizeUrl(`facebook.com/${bestFb}`, 'facebook.com');
    }

    // Twitter/X - find all matches
    const twitterMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi);
    const twitterUrls = Array.from(twitterMatches).map(m => m[1]).filter(isValidSocialHandle);
    if (twitterUrls.length > 0) {
      const bestTwitter = findMostCommon(twitterUrls);
      links.twitter = normalizeUrl(`twitter.com/${bestTwitter}`, 'twitter.com');
    }

    // Instagram - find all matches
    const instaMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/gi);
    const instaUrls = Array.from(instaMatches).map(m => m[1]).filter(isValidSocialHandle);
    if (instaUrls.length > 0) {
      const bestInsta = findMostCommon(instaUrls);
      links.instagram = normalizeUrl(`instagram.com/${bestInsta}`, 'instagram.com');
    }

    // YouTube - find all matches
    const youtubeMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel\/|user\/|c\/|@)?([a-zA-Z0-9_-]+)/gi);
    const youtubeUrls = Array.from(youtubeMatches).map(m => m[1]).filter(isValidSocialHandle);
    if (youtubeUrls.length > 0) {
      const bestYoutube = findMostCommon(youtubeUrls);
      links.youtube = normalizeUrl(`youtube.com/${bestYoutube}`, 'youtube.com');
    }

    const foundLinks = Object.keys(links).length;
    if (foundLinks > 0) {
      console.log(`  ✅ Found ${foundLinks} social media link(s)`);
    }

    return links;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`  ⚠️  Timeout fetching ${websiteUrl}`);
    } else {
      console.log(`  ⚠️  Error extracting social media from ${websiteUrl}:`, error instanceof Error ? error.message : String(error));
    }
    return {};
  }
}

function normalizeUrl(url: string, domain: string): string {
  // Ensure it starts with https://
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  // Remove trailing slashes
  url = url.replace(/\/+$/, '');

  // Remove www. for consistency
  url = url.replace('://www.', '://');

  return url;
}

function isValidSocialHandle(handle: string): boolean {
  // Filter out generic/invalid social media handles
  const invalidHandles = new Set([
    'groups', 'pages', 'share', 'sharer', 'home', 'login', 'signup',
    'about', 'privacy', 'terms', 'help', 'support', 'contact',
    'intent', 'share', 'hashtag', 'search', 'explore', 'p', 'reel',
    'watch', 'playlist', 'embed', 'oembed', 'plugins', 'dialog',
    'SF', 'sfgov', 'bolt', 'pharmacy', // Common generic ones we've seen
  ]);

  // Must be at least 3 characters and not in the invalid list
  return handle.length >= 3 && !invalidHandles.has(handle);
}

function findMostCommon(handles: string[]): string {
  // Count occurrences of each handle
  const counts = new Map<string, number>();
  for (const handle of handles) {
    counts.set(handle, (counts.get(handle) || 0) + 1);
  }

  // Return the most common one (or first if tie)
  let best = handles[0];
  let maxCount = 1;
  for (const [handle, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      best = handle;
    }
  }

  return best;
}

function validateWebsiteMatchesName(html: string, resourceName: string): boolean {
  // Normalize the HTML and resource name for comparison
  const normalizedHtml = html.toLowerCase();
  const normalizedName = resourceName.toLowerCase();

  // Extract significant words from the resource name (ignore common words)
  const commonWords = new Set([
    'food', 'pantry', 'bank', 'the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'for', 'to',
    'community', 'center', 'program', 'services', 'ministry', 'mission', 'church',
  ]);

  const words = normalizedName
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word));

  // If no significant words, allow through (can't validate)
  if (words.length === 0) {
    return true;
  }

  // Check if at least 50% of significant words appear on the page
  let matchCount = 0;
  for (const word of words) {
    if (normalizedHtml.includes(word)) {
      matchCount++;
    }
  }

  const matchRatio = matchCount / words.length;
  return matchRatio >= 0.5;
}

// ABOUTME: Extracts social media links from website HTML
// ABOUTME: Finds Facebook, Twitter, Instagram, and YouTube URLs

interface SocialMediaLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
}

export async function extractSocialMediaLinks(
  websiteUrl: string
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

    // Extract social media URLs using regex
    const links: SocialMediaLinks = {};

    // Facebook
    const fbMatch = html.match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i);
    if (fbMatch) {
      links.facebook = normalizeUrl(fbMatch[0], 'facebook.com');
    }

    // Twitter/X
    const twitterMatch = html.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/i);
    if (twitterMatch) {
      links.twitter = normalizeUrl(twitterMatch[0], 'twitter.com');
    }

    // Instagram
    const instaMatch = html.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+/i);
    if (instaMatch) {
      links.instagram = normalizeUrl(instaMatch[0], 'instagram.com');
    }

    // YouTube
    const youtubeMatch = html.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel\/|user\/|c\/|@)?[a-zA-Z0-9_-]+/i);
    if (youtubeMatch) {
      links.youtube = normalizeUrl(youtubeMatch[0], 'youtube.com');
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

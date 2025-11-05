import { extractSocialMediaLinks } from "./src/social-media-extractor";

// Test with Mission Food Hub
const result = await extractSocialMediaLinks("https://www.missionfoodhub.org/", "Mission Food Hub");

console.log("Extracted links:");
console.log(JSON.stringify(result, null, 2));

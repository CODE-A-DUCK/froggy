import { readFileSync } from "fs";

const content = readFileSync("./src/shared/emojis.ts", "utf8");

// Extract all <:name:id> matches
const regex = /<:\w+:(\d+)>/g;
let match;
const invalidIds: string[] = [];

while ((match = regex.exec(content)) !== null) {
  const id = match[1];
  // Valid Discord snowflakes are 17 to 19 digits. However, most modern emojis have 18 or 19.
  // We can also check for potential typos by looking at lengths.
  if (id.length < 17 || id.length > 19) {
    invalidIds.push(id);
  } else {
    // Check if the ID seems too small compared to other emojis
    // Most emojis in the list start with 151
    if (!id.startsWith("151")) {
      console.log("Suspicious ID (might be old or typo):", id);
    }
  }
}

if (invalidIds.length > 0) {
  console.log("Found invalid length emoji IDs:", invalidIds);
} else {
  console.log("All emoji IDs have valid lengths.");
}

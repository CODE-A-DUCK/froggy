// Might bring warnings, but leave it as-is

import fs from "fs";
import { execSync } from "child_process";

const files = execSync('find src -type f -name "*.js"')
  .toString()
  .split("\n")
  .filter(Boolean);

let updatedCount = 0;
for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  if (content.includes('EMOJIS["')) {
    const updated = content.replace(
      /EMOJIS\["([a-zA-Z0-9_]+)"\]/g,
      "EMOJIS.$1",
    );
    fs.writeFileSync(file, updated);
    updatedCount++;
  }
}
console.log(`Successfully updated ${updatedCount} files to use dot notation.`);

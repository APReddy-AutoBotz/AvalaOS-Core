import fs from "node:fs/promises";
import path from "node:path";
import { createContactSheet } from "../src/build-all.mjs";
import { DECKS } from "../src/theme.mjs";

for (const meta of Object.values(DECKS)) {
  const dir = path.join(meta.outputDir, "thumbnails");
  const files = (await fs.readdir(dir))
    .filter(name => /^slide-\d+\.png$/.test(name))
    .sort()
    .map(name => path.join(dir, name));
  if (!files.length) throw new Error(`No slide PNGs in ${dir}`);
  const output = path.join(dir, "contact-sheet.png");
  await createContactSheet(files, output);
  console.log(output);
}

import { buildAll } from "../src/build-all.mjs";

const results = await buildAll();
for (const result of results) console.log(`${result.key}: rendered ${result.slideCount} slides to ${result.thumbnailDir}`);

import { buildDeckByKey, loadInputs, prepareAssets } from "./build-all.mjs";

await prepareAssets();
const result = await buildDeckByKey("brand", { inputs: await loadInputs() });
console.log(`${result.key}: ${result.slideCount} slides`);

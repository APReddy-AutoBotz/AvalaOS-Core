import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";
import { BUILD_DIR, DECKS, ROOT } from "../src/theme.mjs";

const failures = [];
const checks = [];

function pass(message) { checks.push(`PASS ${message}`); }
function fail(message) { failures.push(message); }

async function statAtLeast(file, minimum) {
  try {
    const stat = await fs.stat(file);
    if (stat.size < minimum) fail(`${file} is ${stat.size} bytes; expected at least ${minimum}`);
    else pass(`${path.relative(ROOT, file)} is ${stat.size} bytes`);
    return stat.size;
  } catch (error) {
    fail(`${file} missing: ${error.message}`);
    return 0;
  }
}

const prohibited = [
  /\bTODO\b/i,
  /Lorem ipsum/i,
  /localhost/i,
  /Approved documents go into Monitor/i,
  /Monitor creates (tasks|work items|user stories)/i,
  /AI decides (the )?(score|recommendation|risk|approval)/i,
  /zero learning curve/i,
  /no training required/i,
  /one-click autonomous delivery/i,
  /Avala Delivery is a Jira replacement/i,
  /Enterprise BYOK available/i,
  /production[- ]ready/i,
  /SOC 2 certified|ISO 27001 certified|HIPAA compliant|GDPR compliant/i
];

for (const meta of Object.values(DECKS)) {
  const pptx = path.join(meta.outputDir, `${meta.basename}.pptx`);
  const pdf = path.join(meta.outputDir, `${meta.basename}.pdf`);
  const notes = path.join(meta.outputDir, `${meta.basename}-notes.md`);
  const contact = path.join(meta.outputDir, "thumbnails", "contact-sheet.png");
  await statAtLeast(pptx, 150_000);
  await statAtLeast(pdf, 150_000);
  await statAtLeast(notes, 5_000);
  await statAtLeast(contact, 75_000);

  try {
    const presentation = await PresentationFile.importPptx(await FileBlob.load(pptx));
    if (presentation.slides.items.length !== meta.expectedSlides) fail(`${meta.key}: PPTX has ${presentation.slides.items.length} slides; expected ${meta.expectedSlides}`);
    else pass(`${meta.key}: PPTX re-imported with ${meta.expectedSlides} slides`);
  } catch (error) {
    fail(`${meta.key}: PPTX re-import failed: ${error.message}`);
  }

  try {
    const document = await PDFDocument.load(await fs.readFile(pdf));
    if (document.getPageCount() !== meta.expectedSlides) fail(`${meta.key}: PDF has ${document.getPageCount()} pages; expected ${meta.expectedSlides}`);
    else pass(`${meta.key}: PDF loaded with ${meta.expectedSlides} pages`);
  } catch (error) {
    fail(`${meta.key}: PDF load failed: ${error.message}`);
  }

  try {
    const slideFiles = (await fs.readdir(path.join(meta.outputDir, "thumbnails"))).filter(name => /^slide-\d+\.png$/.test(name));
    if (slideFiles.length !== meta.expectedSlides) fail(`${meta.key}: ${slideFiles.length} rendered slide PNGs; expected ${meta.expectedSlides}`);
    else pass(`${meta.key}: all ${meta.expectedSlides} slide PNGs rendered`);
  } catch (error) {
    fail(`${meta.key}: thumbnail read failed: ${error.message}`);
  }

  try {
    const manifest = JSON.parse(await fs.readFile(path.join(BUILD_DIR, `${meta.key}-manifest.json`), "utf8"));
    const text = manifest.visibleText.join("\n");
    for (const pattern of prohibited) if (pattern.test(text)) fail(`${meta.key}: prohibited visible text matched ${pattern}`);
    if (!/Synthetic product preview/i.test(text) && meta.key !== "brand") fail(`${meta.key}: missing synthetic-product qualifier`);
    if (meta.key === "investor" && !/ROADMAP VISION/i.test(text)) fail("investor: Avala Assemble lacks visible ROADMAP VISION label");
    pass(`${meta.key}: visible-copy guard scan completed`);
  } catch (error) {
    fail(`${meta.key}: manifest verification failed: ${error.message}`);
  }
}

try {
  const fontReport = JSON.parse(await fs.readFile(path.join(BUILD_DIR, "font-report.json"), "utf8"));
  if (!fontReport.hasOutfit || !fontReport.hasInter) fail(`Font report failed: ${JSON.stringify(fontReport)}`);
  else pass("Outfit and Inter registered for deterministic rendering");
} catch (error) {
  fail(`Font report missing: ${error.message}`);
}

await fs.writeFile(path.join(BUILD_DIR, "verification-report.txt"), `${[...checks, ...failures.map(item => `FAIL ${item}`)].join("\n")}\n`);
for (const check of checks) console.log(check);
if (failures.length) {
  for (const item of failures) console.error(`FAIL ${item}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} verification checks; 0 failures`);
}

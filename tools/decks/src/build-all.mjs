import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import sharp from "sharp";
import YAML from "yaml";
import { PDFDocument } from "pdf-lib";
import { Presentation, PresentationFile } from "@oai/artifact-tool";
import { BRAND_CONCEPT_DIR, BUILD_DIR, DECK_ROOT, DECKS, FONT_DIR, INPUTS_PATH, ROOT, SCREENSHOT_ASSET_DIR, SCREENSHOT_SOURCE_DIR, SIZE } from "./theme.mjs";
import { buildNotesMarkdown, drawSlide, visibleText } from "./components.mjs";
import { DECK_FACTORIES } from "./content.mjs";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function saveBlob(blob, outputPath) {
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
}

async function registerFonts() {
  const resolved = import.meta.resolve("@oai/artifact-tool");
  const artifactEntry = fileURLToPath(resolved);
  const artifactRoot = path.dirname(path.dirname(artifactEntry));
  const skiaEntry = path.join(artifactRoot, "node_modules", "skia-canvas", "lib", "index.mjs");
  const { FontLibrary } = await import(pathToFileURL(skiaEntry).href);
  const outfit = path.join(FONT_DIR, "Outfit-Variable.ttf");
  const inter = path.join(FONT_DIR, "Inter-Variable.ttf");
  FontLibrary.use({ Outfit: outfit, Inter: inter });
  const report = {
    registered: ["Outfit", "Inter"],
    hasOutfit: FontLibrary.has("Outfit"),
    hasInter: FontLibrary.has("Inter"),
    outfitFile: path.relative(ROOT, outfit),
    interFile: path.relative(ROOT, inter)
  };
  await ensureDir(BUILD_DIR);
  await fs.writeFile(path.join(BUILD_DIR, "font-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function prepareScreenshot(name) {
  const source = path.join(SCREENSHOT_SOURCE_DIR, name);
  const target = path.join(SCREENSHOT_ASSET_DIR, name.replace(/\.png$/i, "-deck.png"));
  const meta = await sharp(source).metadata();
  const left = Math.min(250, Math.max(0, (meta.width ?? 1440) - 1000));
  const width = (meta.width ?? 1440) - left;
  const height = meta.height ?? 900;
  const label = Buffer.from(
    `<svg width="${width}" height="44" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="44" fill="#001B30" fill-opacity="0.92"/>` +
    `<rect width="8" height="44" fill="#FFBC03"/>` +
    `<text x="28" y="29" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="1.1">SYNTHETIC PRODUCT PREVIEW • NO LIVE EXECUTION</text>` +
    `</svg>`
  );
  await sharp(source)
    .extract({ left, top: 0, width, height })
    .composite([{ input: label, left: 0, top: height - 44 }])
    .png({ compressionLevel: 9 })
    .toFile(target);
  return target;
}

async function prepareBrandAssets() {
  const sourceLockup = path.join(ROOT, "public", "brand", "avala-os-enterprise-lockup.svg");
  const logoDir = path.join(DECK_ROOT, "assets", "logo");
  await ensureDir(logoDir);
  await fs.copyFile(sourceLockup, path.join(logoDir, "avala-os-enterprise-lockup.svg"));
  await sharp(sourceLockup, { density: 180 }).png().toFile(path.join(logoDir, "avala-os-enterprise-lockup.png"));
  await sharp(sourceLockup, { density: 180 }).png().toFile(path.join(BRAND_CONCEPT_DIR, "current-enterprise-lockup.png"));
  for (const concept of ["concept-01-modular-a", "concept-02-governed-bridge", "concept-03-assembly-node"]) {
    await sharp(path.join(BRAND_CONCEPT_DIR, `${concept}.svg`), { density: 180 })
      .resize(1000, 1000, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(BRAND_CONCEPT_DIR, `${concept}.png`));
  }
}

export async function prepareAssets() {
  await ensureDir(SCREENSHOT_ASSET_DIR);
  const names = [
    "home-command-center.png",
    "assess-process-catalog.png",
    "govern-workbench.png",
    "studio-artifact-workspace.png",
    "delivery-board.png",
    "monitor-overview.png",
    "admin-controls.png",
    "application-portfolio-readiness.png"
  ];
  for (const name of names) await prepareScreenshot(name);
  await prepareBrandAssets();
}

export async function loadInputs() {
  return YAML.parse(await fs.readFile(INPUTS_PATH, "utf8"));
}

export async function createPdfFromPngs(pngPaths, outputPath) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(path.basename(outputPath, ".pdf"));
  pdf.setCreator("AvalaOS deterministic deck generator");
  pdf.setProducer("pdf-lib from @oai/artifact-tool slide renders");
  for (const pngPath of pngPaths) {
    const bytes = await fs.readFile(pngPath);
    const image = await pdf.embedPng(bytes);
    const page = pdf.addPage([SIZE.width, SIZE.height]);
    page.drawImage(image, { x: 0, y: 0, width: SIZE.width, height: SIZE.height });
  }
  await fs.writeFile(outputPath, await pdf.save({ useObjectStreams: false }));
}

export async function createContactSheet(pngPaths, outputPath) {
  const columns = pngPaths.length <= 10 ? 2 : 3;
  const thumbWidth = columns === 2 ? 560 : 360;
  const thumbHeight = Math.round(thumbWidth * 9 / 16);
  const gap = 26;
  const labelHeight = 34;
  const rows = Math.ceil(pngPaths.length / columns);
  const canvasWidth = columns * thumbWidth + (columns + 1) * gap;
  const canvasHeight = rows * (thumbHeight + labelHeight) + (rows + 1) * gap;
  const composites = [];
  for (let i = 0; i < pngPaths.length; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const left = gap + col * (thumbWidth + gap);
    const top = gap + row * (thumbHeight + labelHeight + gap);
    const thumb = await sharp(pngPaths[i]).resize(thumbWidth, thumbHeight).png().toBuffer();
    composites.push({ input: thumb, left, top });
    const label = Buffer.from(`<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#001B30"/><text x="14" y="23" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="15" font-weight="700">SLIDE ${String(i + 1).padStart(2, "0")}</text></svg>`);
    composites.push({ input: label, left, top: top + thumbHeight });
  }
  await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#E8EEF4" } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

export async function buildDeckByKey(key, options = {}) {
  const inputs = options.inputs ?? await loadInputs();
  const meta = DECKS[key];
  if (!meta) throw new Error(`Unknown deck key: ${key}`);
  const factory = DECK_FACTORIES[key];
  const slidesData = factory(inputs);
  if (slidesData.length !== meta.expectedSlides) throw new Error(`${key}: expected ${meta.expectedSlides} slides, got ${slidesData.length}`);

  await ensureDir(meta.outputDir);
  const thumbnailDir = path.join(meta.outputDir, "thumbnails");
  await ensureDir(thumbnailDir);

  const presentation = Presentation.create({ slideSize: SIZE });
  const notes = [];
  for (let i = 0; i < slidesData.length; i += 1) {
    const deckSlide = presentation.slides.add();
    notes.push(await drawSlide(deckSlide, slidesData[i], meta, i + 1));
  }

  const pptxPath = path.join(meta.outputDir, `${meta.basename}.pptx`);
  const pdfPath = path.join(meta.outputDir, `${meta.basename}.pdf`);
  const notesPath = path.join(meta.outputDir, `${meta.basename}-notes.md`);
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(pptxPath);

  const pngPaths = [];
  for (let i = 0; i < presentation.slides.items.length; i += 1) {
    const output = path.join(thumbnailDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await saveBlob(await presentation.export({ slide: presentation.slides.items[i], format: "png", scale: 1 }), output);
    pngPaths.push(output);
    const layout = await presentation.slides.items[i].export({ format: "layout" });
    await fs.writeFile(path.join(BUILD_DIR, `${key}-slide-${String(i + 1).padStart(2, "0")}.layout.json`), await layout.text());
  }
  await createPdfFromPngs(pngPaths, pdfPath);
  await createContactSheet(pngPaths, path.join(thumbnailDir, "contact-sheet.png"));
  await fs.writeFile(notesPath, `${buildNotesMarkdown(meta, slidesData, notes)}\n`);

  const result = {
    key,
    basename: meta.basename,
    slideCount: slidesData.length,
    audience: meta.audience,
    theme: meta.theme,
    pptxPath,
    pdfPath,
    notesPath,
    thumbnailDir,
    contactSheet: path.join(thumbnailDir, "contact-sheet.png"),
    visibleText: slidesData.map(visibleText),
    claims: [...new Set(slidesData.flatMap(item => item.claims))]
  };
  await fs.writeFile(path.join(BUILD_DIR, `${key}-manifest.json`), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function buildAll() {
  await ensureDir(BUILD_DIR);
  const fontReport = await registerFonts();
  if (!fontReport.hasOutfit || !fontReport.hasInter) throw new Error(`Font registration failed: ${JSON.stringify(fontReport)}`);
  await prepareAssets();
  const inputs = await loadInputs();
  const results = [];
  for (const key of ["marketing", "client", "investor", "brand"]) results.push(await buildDeckByKey(key, { inputs }));
  const sourceNotes = [
    "AvalaOS deck suite source notes",
    "Repository authority: docs/00_SOURCE_OF_TRUTH.md and task-specific documents routed by docs/architecture/document-authority-map.md.",
    "Product imagery: committed synthetic product captures under public/marketing/screenshots/.",
    "Brand mark: public/brand/avala-os-enterprise-lockup.svg.",
    "Fonts: Outfit and Inter from the Google Fonts repository, distributed under the bundled SIL Open Font License 1.1 files.",
    "No stock imagery, customer data, secrets, signed URLs, competitor assets, or production infrastructure identifiers were used."
  ].join("\n");
  await fs.writeFile(path.join(BUILD_DIR, "source-notes.txt"), `${sourceNotes}\n`);
  await fs.writeFile(path.join(BUILD_DIR, "build-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAll().then(results => {
    for (const result of results) console.log(`${result.key}: ${result.slideCount} slides -> ${result.pptxPath}`);
    // artifact-tool's optional inspect hook may leave a diagnostic exitCode after
    // a successful save. At this point every awaited artifact has been written.
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

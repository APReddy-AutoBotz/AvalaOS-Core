import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const workspace = path.resolve(import.meta.dirname, "..");
const result = spawnSync(process.execPath, [path.join(workspace, "src", "build-all.mjs")], {
  cwd: workspace,
  stdio: "inherit"
});

if (result.status === 0) process.exit(0);

// artifact-tool can report a diagnostic exit after successfully completing its
// inspect hook. Normalize only when the awaited build manifest and every named
// artifact prove that the complete four-deck build finished.
const manifestPath = path.join(workspace, ".build", "build-results.json");
let complete = false;
try {
  const manifests = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  complete = manifests.length === 4 && manifests.every(item => {
    const namedFiles = [item.pptxPath, item.pdfPath, item.notesPath, item.contactSheet];
    const slidePngs = fs.readdirSync(item.thumbnailDir).filter(name => /^slide-\d{2}\.png$/.test(name));
    return namedFiles.every(file => fs.statSync(file).size > 0) && slidePngs.length === item.slideCount;
  });
} catch {
  complete = false;
}

if (!complete) process.exit(result.status ?? 1);
console.warn("Normalized artifact-tool diagnostic exit after validating the complete four-deck build manifest.");
process.exit(0);


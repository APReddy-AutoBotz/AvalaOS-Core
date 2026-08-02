import fs from "node:fs/promises";
import path from "node:path";
import { COLOR, FONT, PAGE, SCREENSHOTS, SCREENSHOT_ASSET_DIR, BRAND_CONCEPT_DIR, SOURCE_MAP, SIZE } from "./theme.mjs";

const transparent = "#00000000";

export function addShape(slide, geometry, position, fill, line = transparent, lineWidth = 0, name) {
  return slide.shapes.add({
    geometry,
    name,
    position,
    fill,
    line: { style: "solid", fill: line, width: lineWidth }
  });
}

export function addText(slide, text, position, options = {}) {
  const shape = addShape(slide, "rect", position, options.fill ?? transparent, options.line ?? transparent, options.lineWidth ?? 0, options.name);
  shape.text = String(text ?? "");
  shape.text.fontSize = options.size ?? 20;
  shape.text.color = options.color ?? COLOR.ink;
  shape.text.bold = Boolean(options.bold);
  shape.text.typeface = options.face ?? FONT.body;
  shape.text.alignment = options.align ?? "left";
  shape.text.verticalAlignment = options.valign ?? "top";
  shape.text.insets = options.insets ?? { left: 0, right: 0, top: 0, bottom: 0 };
  return shape;
}

export function addRule(slide, x, y, width, color = COLOR.amber, height = 4) {
  return addShape(slide, "rect", { left: x, top: y, width, height }, color);
}

export function addPill(slide, text, x, y, width, options = {}) {
  addShape(slide, "roundRect", { left: x, top: y, width, height: 30 }, options.fill ?? COLOR.paleGold, options.line ?? COLOR.amber, 1);
  addText(slide, text, { left: x + 10, top: y + 6, width: width - 20, height: 18 }, {
    size: 12, bold: true, color: options.color ?? COLOR.navy, align: "center", valign: "mid"
  });
}

export function addEyebrow(slide, text, dark = false) {
  addRule(slide, PAGE.left, 42, 56, COLOR.amber, 3);
  addText(slide, text, { left: PAGE.left + 70, top: 31, width: 750, height: 28 }, {
    size: 13, bold: true, color: dark ? "#F5D778" : COLOR.navy2, face: FONT.body
  });
}

export function addTitle(slide, title, dark = false, options = {}) {
  addText(slide, title, {
    left: options.left ?? PAGE.left,
    top: options.top ?? 80,
    width: options.width ?? 1080,
    height: options.height ?? 92
  }, {
    size: options.size ?? 34,
    bold: true,
    color: dark ? COLOR.white : COLOR.ink,
    face: FONT.title,
    valign: "mid"
  });
}

export function addFooter(slide, index, deckLabel, qualifier, dark = false) {
  const color = dark ? "#B9C7D5" : COLOR.faint;
  addText(slide, deckLabel, { left: 64, top: 680, width: 380, height: 18 }, { size: 10, bold: true, color });
  if (qualifier) addText(slide, qualifier, { left: 388, top: 680, width: 760, height: 18 }, { size: 10, color, align: "center" });
  addText(slide, String(index).padStart(2, "0"), { left: 1168, top: 680, width: 48, height: 18 }, { size: 10, bold: true, color, align: "right" });
}

export function addBulletList(slide, bullets, position, options = {}) {
  const gap = options.gap ?? 42;
  const color = options.color ?? COLOR.ink;
  const accent = options.accent ?? COLOR.amber;
  const size = options.size ?? 18;
  bullets.forEach((bullet, index) => {
    const y = position.top + index * gap;
    addShape(slide, "ellipse", { left: position.left, top: y + 8, width: 9, height: 9 }, accent);
    addText(slide, bullet, { left: position.left + 24, top: y, width: position.width - 24, height: gap - 4 }, {
      size, color, bold: options.bold ?? false, valign: "mid"
    });
  });
}

async function addImageFile(slide, imagePath, position, options = {}) {
  const bytes = await fs.readFile(imagePath);
  if (!bytes.byteLength) throw new Error(`Empty image: ${imagePath}`);
  const ext = path.extname(imagePath).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const imageConfig = {
    blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType,
    alt: options.alt ?? "AvalaOS product visual",
    fit: options.fit ?? "cover",
    position,
    geometry: options.geometry ?? "roundRect"
  };
  if ((options.geometry ?? "roundRect") !== "rect") imageConfig.borderRadius = options.borderRadius ?? "rounded-xl";
  return slide.images.add(imageConfig);
}

export async function addScreenshot(slide, key, position, options = {}) {
  const file = SCREENSHOTS[key];
  if (!file) throw new Error(`Unknown screenshot key: ${key}`);
  const deckPath = path.join(SCREENSHOT_ASSET_DIR, file.replace(/\.png$/i, "-deck.png"));
  addShape(slide, "roundRect", { left: position.left - 6, top: position.top - 6, width: position.width + 12, height: position.height + 12 }, options.frameFill ?? COLOR.white, options.frameLine ?? COLOR.border, 1);
  await addImageFile(slide, deckPath, position, { alt: `Synthetic AvalaOS ${key} product preview`, fit: options.fit ?? "cover" });
}

export async function addConcept(slide, filename, position) {
  const png = path.join(BRAND_CONCEPT_DIR, filename.replace(/\.svg$/i, ".png"));
  await addImageFile(slide, png, position, { alt: `AvalaOS brand concept ${filename}`, fit: "contain", geometry: "rect" });
}

function slidePoints(data) {
  if (data.bullets?.length) return data.bullets;
  if (data.stages?.length) return data.stages.map(item => Array.isArray(item) ? item.slice(0, 3).join(": ") : String(item));
  if (data.statusColumns?.length) return data.statusColumns.flatMap(column => column.items.slice(0, 2));
  if (data.left || data.right) return [...(data.left?.items ?? []), ...(data.right?.items ?? [])];
  return [];
}

export function makeSpeakerNotes(data, deckMeta, index) {
  const points = slidePoints(data).slice(0, 5);
  const talk = [
    data.noteLead || `Use this slide to establish that ${data.title.replace(/\n/g, " ").replace(/[.!?]+$/, "").toLowerCase()}.`,
    data.subtitle || (points.length ? `Walk through ${points.slice(0, 3).join(", ")}, and ${points[3] ?? "the implication for the next decision"}.` : "Connect the visual to the governed decision path."),
    points.length > 3 ? `The remaining signals — ${points.slice(3).join(" and ")} — matter because they keep authority and evidence visible.` : "The key distinction is that AvalaOS governs the decision and handoff while authorized systems execute.",
    data.qualifier ? `State the boundary plainly: ${data.qualifier}` : "Keep the source and deployment boundary explicit.",
    "Pause on the consequence for this audience before advancing to the next stage of the story."
  ].join(" ");
  const sources = data.claims.map(id => `- ${id}: ${SOURCE_MAP[id] ?? "See source/claim-ledger.md"}`);
  if (data.screenshot || data.screenshots?.length) sources.push("- Asset: public/marketing/screenshots/ (synthetic committed product captures)");
  if (data.concept) sources.push(`- Asset: docs/marketing/decks/brand/concepts/${data.concept} (original internal exploration)`);
  sources.push("- Fonts: Outfit and Inter, SIL Open Font License 1.1; bundled under docs/marketing/decks/assets/fonts/");
  return [
    `PRIMARY TALK TRACK (45–75 seconds)\n${talk}`,
    `KEY POINT\n${data.title.replace(/\n/g, " ")}`,
    `AUDIENCE-SPECIFIC EMPHASIS\n${data.emphasis}`,
    `CLAIMS USED\n${data.claims.join(", ") || "None"}`,
    `CURRENT VS ROADMAP\n${data.roadmap}`,
    `LIKELY OBJECTION\n${data.objection}`,
    `SUGGESTED RESPONSE\n${data.response}`,
    `AP INPUT REQUIRED\n${data.apInput}`,
    `[Sources]\n${sources.join("\n")}\n[/Sources]`
  ].join("\n\n");
}

function setBackground(slide, fill) {
  slide.background.fill = fill;
}

async function drawCover(slide, data) {
  setBackground(slide, COLOR.navy);
  addRule(slide, 64, 54, 84, COLOR.amber, 6);
  addText(slide, data.eyebrow, { left: 64, top: 78, width: 550, height: 28 }, { size: 13, bold: true, color: "#F5D778" });
  addText(slide, data.title, { left: 64, top: 135, width: 540, height: 230 }, { size: 48, bold: true, color: COLOR.white, face: FONT.title, valign: "mid" });
  addText(slide, data.subtitle, { left: 64, top: 390, width: 500, height: 110 }, { size: 21, color: "#DCE6EF", valign: "mid" });
  if (data.screenshot) await addScreenshot(slide, data.screenshot, { left: 650, top: 110, width: 566, height: 435 }, { frameFill: COLOR.navy2, frameLine: COLOR.navy3 });
  addPill(slide, "EVIDENCE • HUMAN AUTHORITY • TRACEABLE HANDOFF", 64, 565, 470, { fill: COLOR.navy2, line: COLOR.navy3, color: COLOR.white });
}

async function drawStatement(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addText(slide, data.title, { left: 64, top: 105, width: 570, height: 220 }, { size: 45, bold: true, color: COLOR.white, face: FONT.title, valign: "mid" });
  addRule(slide, 64, 350, 420, COLOR.amber, 5);
  addBulletList(slide, data.bullets, { left: 720, top: 128, width: 460 }, { size: 19, color: "#EDF3F8", accent: COLOR.amber, gap: 76 });
}

async function drawTechFit(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 70, height: 70 });
  const startY = 172;
  data.stages.forEach((row, i) => {
    const y = startY + i * 73;
    addText(slide, row[0], { left: 76, top: y, width: 300, height: 54 }, { size: 18, bold: true, color: COLOR.ink, valign: "mid" });
    addShape(slide, "rightArrow", { left: 385, top: y + 8, width: 70, height: 38 }, i === 5 ? COLOR.amber : COLOR.navy2);
    addText(slide, row[1], { left: 480, top: y, width: 280, height: 54 }, { size: 20, bold: true, color: COLOR.navy, valign: "mid" });
    addText(slide, row[2], { left: 790, top: y, width: 410, height: 54 }, { size: 16, color: COLOR.muted, valign: "mid" });
    if (i < data.stages.length - 1) addRule(slide, 76, y + 62, 1124, COLOR.border, 1);
  });
}

async function drawLifecycle(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 66, height: 72 });
  const gap = 14;
  const width = (1152 - gap * 4) / 5;
  for (let i = 0; i < 5; i += 1) {
    const x = 64 + i * (width + gap);
    await addScreenshot(slide, data.screenshots[i], { left: x, top: 175, width, height: 220 });
    addText(slide, `0${i + 1}`, { left: x, top: 422, width: 30, height: 24 }, { size: 12, bold: true, color: COLOR.amber });
    addText(slide, data.stages[i][0], { left: x + 34, top: 414, width: width - 34, height: 34 }, { size: 20, bold: true, color: COLOR.navy, face: FONT.title });
    addText(slide, data.stages[i][1], { left: x, top: 456, width, height: 72 }, { size: 15, color: COLOR.muted });
  }
  addRule(slide, 64, 548, 1152, COLOR.amber, 4);
}

async function drawScreenshot(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 65, width: 1120, height: 84 });
  await addScreenshot(slide, data.screenshot, { left: 500, top: 180, width: 716, height: 440 });
  addBulletList(slide, data.bullets, { left: 72, top: 202, width: 390 }, { size: 17, gap: Math.min(54, 350 / Math.max(data.bullets.length, 1)) });
}

async function drawDualScreenshot(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 65, height: 70 });
  if (data.subtitle) addText(slide, data.subtitle, { left: 64, top: 137, width: 1152, height: 52 }, { size: 17, color: COLOR.muted });
  await addScreenshot(slide, data.screenshots[0], { left: 64, top: 210, width: 550, height: 345 });
  await addScreenshot(slide, data.screenshots[1], { left: 666, top: 210, width: 550, height: 345 });
  const chips = data.bullets.slice(0, 5);
  const chipWidth = 1120 / chips.length;
  chips.forEach((item, i) => addPill(slide, item, 80 + i * chipWidth, 582, chipWidth - 16, { fill: i % 2 ? COLOR.bluePale : COLOR.paleGold, line: i % 2 ? COLOR.navy3 : COLOR.amber }));
}

async function drawTrust(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 70, width: 660, height: 115, size: 39 });
  addBulletList(slide, data.bullets, { left: 74, top: 212, width: 440 }, { size: 18, color: COLOR.white, accent: COLOR.amber, gap: 57 });
  await addScreenshot(slide, data.screenshot, { left: 560, top: 170, width: 656, height: 445 }, { frameFill: COLOR.navy2, frameLine: COLOR.navy3 });
}

async function drawRoles(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 70, height: 74 });
  const left = data.bullets.slice(0, Math.ceil(data.bullets.length / 2));
  const right = data.bullets.slice(Math.ceil(data.bullets.length / 2));
  addBulletList(slide, left, { left: 110, top: 190, width: 430 }, { size: 21, bold: true, gap: 74, accent: COLOR.navy2 });
  addRule(slide, 640, 185, 4, COLOR.amber, 390);
  addBulletList(slide, right, { left: 720, top: 190, width: 430 }, { size: 21, bold: true, gap: 74, accent: COLOR.amber });
  if (data.sideBullets?.length) addText(slide, data.sideBullets.join("  •  "), { left: 100, top: 580, width: 1080, height: 36 }, { size: 15, color: COLOR.muted, align: "center", valign: "mid" });
}

async function drawCTA(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addText(slide, data.title, { left: 80, top: 120, width: 1120, height: 150 }, { size: 46, bold: true, color: COLOR.white, face: FONT.title, align: "center", valign: "mid" });
  addText(slide, data.subtitle, { left: 190, top: 285, width: 900, height: 105 }, { size: 21, color: "#DCE6EF", align: "center", valign: "mid" });
  const bullets = data.bullets;
  const width = 920 / bullets.length;
  bullets.forEach((item, i) => {
    const x = 180 + i * width;
    addShape(slide, "ellipse", { left: x + width / 2 - 20, top: 445, width: 40, height: 40 }, i === bullets.length - 1 ? COLOR.amber : COLOR.navy3, COLOR.amber, 1);
    addText(slide, String(i + 1), { left: x + width / 2 - 20, top: 454, width: 40, height: 22 }, { size: 15, bold: true, color: i === bullets.length - 1 ? COLOR.navy : COLOR.white, align: "center" });
    addText(slide, item, { left: x, top: 505, width, height: 70 }, { size: 17, bold: true, color: COLOR.white, align: "center" });
  });
}

function drawPathColumn(slide, column, x, color, titleFill) {
  addText(slide, column.title, { left: x, top: 184, width: 500, height: 48 }, { size: 24, bold: true, color: titleFill, face: FONT.title });
  column.items.forEach((item, i) => {
    const y = 256 + i * 48;
    addShape(slide, "ellipse", { left: x, top: y + 6, width: 11, height: 11 }, color);
    addText(slide, item, { left: x + 28, top: y, width: 450, height: 34 }, { size: 18, color: COLOR.ink, valign: "mid" });
    if (i < column.items.length - 1) addRule(slide, x + 5, y + 26, 2, color, 24);
  });
}

async function drawComparison(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 68, height: 76 });
  addShape(slide, "roundRect", { left: 64, top: 165, width: 540, height: 465 }, COLOR.white, COLOR.border, 1);
  addShape(slide, "roundRect", { left: 676, top: 165, width: 540, height: 465 }, COLOR.white, COLOR.border, 1);
  drawPathColumn(slide, data.left, 92, COLOR.risk, COLOR.risk);
  drawPathColumn(slide, data.right, 704, COLOR.success, COLOR.navy);
  addShape(slide, "rightArrow", { left: 610, top: 365, width: 60, height: 45 }, COLOR.amber);
}

async function drawFlow(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 67, height: 72 });
  const items = data.stages;
  const rowY = [230, 430];
  items.forEach((item, i) => {
    const row = i < 3 ? 0 : 1;
    const col = i % 3;
    const x = 90 + col * 390;
    const y = rowY[row];
    addShape(slide, "ellipse", { left: x, top: y, width: 58, height: 58 }, i === items.length - 1 ? COLOR.amber : COLOR.navy2);
    addText(slide, item[0], { left: x, top: y + 16, width: 58, height: 26 }, { size: 17, bold: true, color: i === items.length - 1 ? COLOR.navy : COLOR.white, align: "center" });
    addText(slide, item[1], { left: x + 78, top: y - 3, width: 250, height: 65 }, { size: 20, bold: true, color: COLOR.ink, valign: "mid" });
    if (col < 2) addShape(slide, "rightArrow", { left: x + 325, top: y + 15, width: 48, height: 28 }, COLOR.border);
  });
}

async function drawAudience(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 67, width: 1100, height: 86 });
  addRule(slide, 64, 170, 1152, COLOR.amber, 5);
  addBulletList(slide, data.bullets, { left: 100, top: 220, width: 650 }, { size: 20, gap: 58, accent: COLOR.navy2 });
  if (data.sideBullets?.length) {
    addText(slide, "LAND + EXPAND", { left: 820, top: 240, width: 300, height: 34 }, { size: 16, bold: true, color: COLOR.risk, align: "center" });
    addBulletList(slide, data.sideBullets, { left: 820, top: 300, width: 330 }, { size: 18, gap: 74, accent: COLOR.amber });
  } else {
    addText(slide, "DECISION CONTRACT", { left: 820, top: 245, width: 300, height: 36 }, { size: 16, bold: true, color: COLOR.risk, align: "center" });
    addShape(slide, "ellipse", { left: 895, top: 315, width: 150, height: 150 }, COLOR.navy, COLOR.amber, 5);
    addText(slide, "Evidence\n+\nAuthority", { left: 905, top: 345, width: 130, height: 92 }, { size: 20, bold: true, color: COLOR.white, align: "center", valign: "mid" });
  }
}

async function drawCategory(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 67, height: 90, size: 38 });
  const width = 172;
  data.stages.forEach((item, i) => {
    const x = 72 + i * 192;
    addText(slide, `0${i + 1}`, { left: x, top: 205, width: 40, height: 30 }, { size: 14, bold: true, color: COLOR.amber });
    addText(slide, item[0], { left: x, top: 250, width, height: 80 }, { size: 23, bold: true, color: COLOR.white, face: FONT.title });
    addRule(slide, x, 345, width, i === 5 ? COLOR.amber : COLOR.navy3, 4);
    addText(slide, item[1], { left: x, top: 375, width, height: 90 }, { size: 16, color: "#C9D6E1" });
  });
  addText(slide, data.qualifier, { left: 170, top: 545, width: 940, height: 54 }, { size: 19, bold: true, color: COLOR.white, align: "center", valign: "mid" });
}

function statusColor(index) {
  return [COLOR.success, COLOR.risk, COLOR.navy2][index] ?? COLOR.navy2;
}

async function drawStatus(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 65, height: 82 });
  const colWidth = 350;
  data.statusColumns.forEach((column, i) => {
    const x = 64 + i * 401;
    addRule(slide, x, 185, colWidth, statusColor(i), 7);
    addText(slide, column.title, { left: x, top: 210, width: colWidth, height: 35 }, { size: 17, bold: true, color: statusColor(i) });
    addBulletList(slide, column.items, { left: x, top: 270, width: colWidth }, { size: 17, gap: 58, accent: statusColor(i) });
  });
}

async function drawMoat(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 67, height: 85, size: 39 });
  const left = data.bullets.slice(0, 3);
  const right = data.bullets.slice(3);
  addBulletList(slide, left, { left: 80, top: 220, width: 430 }, { size: 19, color: COLOR.white, accent: COLOR.amber, gap: 92 });
  addShape(slide, "ellipse", { left: 540, top: 260, width: 200, height: 200 }, COLOR.navy2, COLOR.amber, 5);
  addText(slide, "GOVERNED\nCONTEXT", { left: 565, top: 320, width: 150, height: 86 }, { size: 25, bold: true, color: COLOR.white, face: FONT.title, align: "center", valign: "mid" });
  addBulletList(slide, right, { left: 790, top: 220, width: 410 }, { size: 19, color: COLOR.white, accent: COLOR.amber, gap: 92 });
}

async function drawCommercial(slide, data) {
  await drawComparison(slide, { ...data, left: data.left, right: data.right });
}

async function drawAssemble(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 65, height: 85, size: 39 });
  const width = 208;
  data.stages.forEach((item, i) => {
    const x = 74 + i * 228;
    addText(slide, item[0], { left: x, top: 195, width, height: 48 }, { size: 24, bold: true, color: i === 2 ? COLOR.amber : COLOR.white, face: FONT.title, align: "center" });
    addRule(slide, x + 20, 255, width - 40, i === 2 ? COLOR.amber : COLOR.navy3, 5);
    addText(slide, item[1], { left: x, top: 280, width, height: 48 }, { size: 15, color: "#C9D6E1", align: "center" });
  });
  addText(slide, data.bullets.join("  •  "), { left: 90, top: 410, width: 1100, height: 90 }, { size: 19, bold: true, color: COLOR.white, align: "center", valign: "mid" });
  addPill(slide, "ROADMAP VISION — NOT A CURRENT APPLICATION-GENERATION CAPABILITY", 330, 550, 620, { fill: COLOR.navy2, line: COLOR.amber, color: COLOR.white });
}

async function drawFunding(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addText(slide, data.title, { left: 80, top: 115, width: 1120, height: 120 }, { size: 44, bold: true, color: COLOR.white, face: FONT.title, align: "center", valign: "mid" });
  const width = 190;
  data.bullets.forEach((item, i) => {
    const x = 105 + i * 215;
    addShape(slide, "ellipse", { left: x + 62, top: 320, width: 66, height: 66 }, i === 0 ? COLOR.amber : COLOR.navy2, COLOR.amber, 2);
    addText(slide, String(i + 1), { left: x + 62, top: 340, width: 66, height: 25 }, { size: 17, bold: true, color: i === 0 ? COLOR.navy : COLOR.white, align: "center" });
    addText(slide, item, { left: x, top: 420, width, height: 95 }, { size: 17, bold: true, color: COLOR.white, align: "center" });
  });
}

async function drawBrandCurrent(slide, data) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 72, height: 80, size: 41 });
  const currentPng = path.join(BRAND_CONCEPT_DIR, "current-enterprise-lockup.png");
  await addImageFile(slide, currentPng, { left: 120, top: 210, width: 1040, height: 250 }, { alt: "Current AvalaOS enterprise lockup", fit: "contain", geometry: "rect" });
  addText(slide, data.subtitle, { left: 160, top: 500, width: 960, height: 100 }, { size: 20, color: "#DCE6EF", align: "center", valign: "mid" });
}

async function drawBrandMeaning(slide, data) {
  setBackground(slide, COLOR.paper);
  addEyebrow(slide, data.eyebrow);
  addTitle(slide, data.title, false, { top: 67, height: 84 });
  const width = 170;
  data.stages.forEach((item, i) => {
    const x = 75 + i * 190;
    addText(slide, item[0], { left: x, top: 190, width, height: 100 }, { size: item[0] === "OS" ? 48 : 62, bold: true, color: i === 2 ? COLOR.amber : COLOR.navy, face: FONT.title, align: "center", valign: "mid" });
    addText(slide, item[1], { left: x, top: 300, width, height: 40 }, { size: 16, bold: true, color: COLOR.muted, align: "center" });
  });
  addBulletList(slide, data.bullets, { left: 160, top: 420, width: 960 }, { size: 18, gap: 43, accent: COLOR.amber });
}

async function drawBrandConcept(slide, data, options = {}) {
  setBackground(slide, COLOR.navy);
  addEyebrow(slide, data.eyebrow, true);
  addTitle(slide, data.title, true, { top: 65, height: 78, size: 40 });
  addShape(slide, "roundRect", { left: 80, top: 165, width: 530, height: 470 }, COLOR.navy2, COLOR.navy3, 1);
  await addConcept(slide, data.concept, { left: 115, top: 195, width: 460, height: 410 });
  addBulletList(slide, data.bullets, { left: 680, top: options.bulletTop ?? 225, width: 470 }, {
    size: options.bulletSize ?? 20,
    color: COLOR.white,
    accent: COLOR.amber,
    gap: options.bulletGap ?? 84
  });
}

async function drawBrandRecommendation(slide, data) {
  await drawBrandConcept(slide, data, { bulletTop: 200, bulletSize: 17, bulletGap: 62 });
  addPill(slide, "RECOMMENDED DIRECTION", 840, 595, 250, { fill: COLOR.amber, line: COLOR.amber, color: COLOR.navy });
}

export async function drawSlide(slide, data, deckMeta, index) {
  const renderers = {
    cover: drawCover,
    statement: drawStatement,
    techfit: drawTechFit,
    lifecycle: drawLifecycle,
    screenshot: drawScreenshot,
    dualScreenshot: drawDualScreenshot,
    trust: drawTrust,
    roles: drawRoles,
    cta: drawCTA,
    comparison: drawComparison,
    flow: drawFlow,
    audience: drawAudience,
    category: drawCategory,
    roadmap: drawStatus,
    status: drawStatus,
    moat: drawMoat,
    commercial: drawCommercial,
    assemble: drawAssemble,
    funding: drawFunding,
    brandCurrent: drawBrandCurrent,
    brandMeaning: drawBrandMeaning,
    brandConcept: drawBrandConcept,
    brandRecommendation: drawBrandRecommendation
  };
  const renderer = renderers[data.layout];
  if (!renderer) throw new Error(`No renderer for layout ${data.layout}`);
  await renderer(slide, data);
  const dark = ["cover", "statement", "trust", "category", "moat", "assemble", "funding", "brandCurrent", "brandConcept", "brandRecommendation"].includes(data.layout);
  addFooter(slide, index, `${deckMeta.theme} • ${deckMeta.audience}`, data.qualifier, dark);
  const notes = makeSpeakerNotes(data, deckMeta, index);
  slide.speakerNotes.textFrame.setText(notes);
  slide.speakerNotes.setVisible(true);
  return notes;
}

export function buildNotesMarkdown(deckMeta, slides, notes) {
  const sections = slides.map((data, index) => [
    `## ${String(index + 1).padStart(2, "0")} — ${data.title.replace(/\n/g, " ")}`,
    notes[index]
  ].join("\n\n"));
  return [
    `# ${deckMeta.basename} speaker notes`,
    `Audience: ${deckMeta.audience}`,
    `Theme: ${deckMeta.theme}`,
    "These companion notes are the authoritative fallback for the embedded PowerPoint notes.",
    ...sections
  ].join("\n\n");
}

export function visibleText(data) {
  return [
    data.eyebrow, data.title, data.subtitle, data.qualifier,
    ...(data.bullets ?? []), ...(data.sideBullets ?? []),
    ...(data.stages ?? []).flat(),
    ...(data.left?.items ?? []), ...(data.right?.items ?? []),
    ...(data.statusColumns ?? []).flatMap(column => [column.title, ...column.items])
  ].filter(Boolean).join("\n");
}

export { SIZE };

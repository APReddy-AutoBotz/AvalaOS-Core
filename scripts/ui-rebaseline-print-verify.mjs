import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.AVALA_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.AVALA_PRINT_OUTPUT || 'C:/tmp/avalaos-ui-print');
const routes = ['/', '/platform', '/solutions', '/trust'];
const pageHeight = 1123;
const failures = [];
const reports = [];
const slug = route => route === '/' ? 'home' : route.slice(1);

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 794, height: pageHeight }, colorScheme: 'light' });
  const page = await context.newPage();

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);

    const report = await page.evaluate(({ estimatedPageHeight }) => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const rootNames = ['html', 'body', '#root', '.public-site'];
      const roots = Object.fromEntries(rootNames.map(selector => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const style = getComputedStyle(element);
        return [selector, { height: style.height, minHeight: style.minHeight, overflow: style.overflow, overflowY: style.overflowY, background: style.backgroundColor }];
      }));
      const positioned = [...document.querySelectorAll('.public-site *')]
        .filter(visible)
        .map(element => ({ element, position: getComputedStyle(element).position }))
        .filter(item => item.position === 'fixed' || item.position === 'sticky')
        .map(item => `${item.element.tagName.toLowerCase()}.${item.element.className}`);
      const contentRects = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main img, main article, main .av-architecture-panel, main .av-boundary-card')]
        .filter(visible)
        .map(element => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, kind: element.tagName.toLowerCase() };
        });
      const footer = document.querySelector('.public-footer');
      const footerRect = footer && visible(footer) ? footer.getBoundingClientRect() : null;
      const mainRect = document.querySelector('main')?.getBoundingClientRect() ?? null;
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const pageCountEstimate = Math.max(1, Math.ceil(documentHeight / estimatedPageHeight));
      const coverage = Array.from({ length: pageCountEstimate }, (_, pageIndex) => {
        const start = pageIndex * estimatedPageHeight;
        const end = start + estimatedPageHeight;
        const intervals = contentRects
          .map(rect => [Math.max(start, rect.top), Math.min(end, rect.bottom)])
          .filter(([top, bottom]) => bottom > top)
          .sort((a, b) => a[0] - b[0]);
        let total = 0;
        let cursorStart = -1;
        let cursorEnd = -1;
        for (const [top, bottom] of intervals) {
          if (cursorStart < 0) {
            cursorStart = top;
            cursorEnd = bottom;
          } else if (top <= cursorEnd) {
            cursorEnd = Math.max(cursorEnd, bottom);
          } else {
            total += cursorEnd - cursorStart;
            cursorStart = top;
            cursorEnd = bottom;
          }
        }
        if (cursorStart >= 0) total += cursorEnd - cursorStart;
        return total / estimatedPageHeight;
      });
      const footerPage = footerRect ? Math.floor(Math.max(0, footerRect.top) / estimatedPageHeight) : -1;
      const mainOnFooterPage = footerPage < 0 ? true : contentRects.some(rect => {
        const start = footerPage * estimatedPageHeight;
        const end = start + estimatedPageHeight;
        return Math.min(end, rect.bottom) - Math.max(start, rect.top) >= 24;
      });
      const clippedImages = [...document.querySelectorAll('main img')].filter(visible).map(image => {
        const rect = image.getBoundingClientRect();
        const parent = image.parentElement?.getBoundingClientRect();
        return {
          alt: image.getAttribute('alt') || '',
          loaded: image.complete && image.naturalWidth > 0,
          clipped: Boolean(parent && (rect.left < parent.left - 1 || rect.right > parent.right + 1 || rect.top < parent.top - 1 || rect.bottom > parent.bottom + 1)),
        };
      });
      return {
        roots,
        positioned,
        documentHeight,
        footerBottom: footerRect?.bottom ?? null,
        footerHeight: footerRect?.height ?? null,
        mainToFooterGap: footerRect && mainRect ? Math.max(0, footerRect.top - mainRect.bottom) : null,
        footerNavVisible: [...document.querySelectorAll('.public-footer nav')].some(visible),
        footerPage,
        mainOnFooterPage,
        coverage,
        clippedImages,
        skipVisible: [...document.querySelectorAll('.av-skip-link')].some(visible),
        hiddenCtasVisible: [...document.querySelectorAll('.av-print-hide')].some(visible),
        interactiveLifecycleVisible: [...document.querySelectorAll('.av-lifecycle-interactive')].some(visible),
        staticLifecycleText: document.querySelector('.av-lifecycle-print')?.textContent ?? '',
      };
    }, { estimatedPageHeight: pageHeight });

    for (const [selector, styles] of Object.entries(report.roots)) {
      if (!styles) failures.push(`${route}: missing print root ${selector}`);
      else if (styles.minHeight !== '0px' || styles.overflow === 'hidden' || styles.overflowY === 'hidden' || styles.overflowY === 'auto') failures.push(`${route}: constrained print root ${selector} ${JSON.stringify(styles)}`);
    }
    if (report.positioned.length) failures.push(`${route}: visible fixed/sticky elements ${report.positioned.join(' | ')}`);
    if (report.skipVisible) failures.push(`${route}: skip link remains visible in print`);
    if (report.hiddenCtasVisible) failures.push(`${route}: a print-hidden CTA remains visible`);
    if (report.interactiveLifecycleVisible) failures.push(`${route}: interactive lifecycle remains visible in print`);
    if (route === '/') {
      for (const stage of ['Assess', 'Govern', 'Studio', 'Delivery', 'Monitor']) if (!report.staticLifecycleText.includes(stage)) failures.push(`${route}: static lifecycle is missing ${stage}`);
    }
    report.coverage.forEach((ratio, index) => {
      if (index < report.coverage.length - 1 && ratio < 0.07) failures.push(`${route}: estimated page ${index + 1} is mostly blank (${Math.round(ratio * 100)}% vertical content coverage)`);
    });
    if (report.footerNavVisible) failures.push(`${route}: redundant site navigation remains visible in the print footer`);
    if (report.footerHeight !== null && report.footerHeight > 120) failures.push(`${route}: print footer is not compact (${Math.round(report.footerHeight)}px)`);
    if (report.mainToFooterGap !== null && report.mainToFooterGap > 24) failures.push(`${route}: print footer is separated from main content by ${Math.round(report.mainToFooterGap)}px`);
    if (report.footerBottom !== null && report.documentHeight - report.footerBottom > pageHeight * 0.4) failures.push(`${route}: large trailing region remains after footer`);
    for (const image of report.clippedImages) {
      if (!image.loaded) failures.push(`${route}: print image did not load (${image.alt})`);
      if (image.clipped) failures.push(`${route}: print image is clipped (${image.alt})`);
    }

    const pdfPath = path.join(outputDir, `${slug(route)}.pdf`);
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    const pdf = await stat(pdfPath);
    if (pdf.size < 10_000) failures.push(`${route}: generated PDF is unexpectedly small (${pdf.size} bytes)`);
    reports.push({ route, pdf: pdfPath, bytes: pdf.size, ...report });
  }

  await context.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`Public print verification failed (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Public print verification passed for ${reports.length} routes: auto-height roots, no fixed overlap, static five-stage lifecycle, clean CTA omission, loaded screenshots, no estimated blank/footer-only/trailing pages, and four PDFs.`);
}

console.log(JSON.stringify(reports.map(({ route, pdf, bytes, coverage }) => ({ route, pdf, bytes, coverage })), null, 2));

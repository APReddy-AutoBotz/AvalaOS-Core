import DOMPurify from 'dompurify';

type MarkdownParser = {
  parse: (markdown: string) => string;
};

const markdownTags = [
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'ul',
];

const blockedProtocol = /^(?:data|javascript|vbscript):/i;

export const isSafeMarkdownHref = (value: string) => {
  const compact = value.replace(/[\u0000-\u0020\u007f]+/g, '');
  if (!compact || blockedProtocol.test(compact)) return false;
  if (compact.startsWith('#')) return true;
  if (compact.startsWith('/') && !compact.startsWith('//')) return true;

  try {
    const parsed = new URL(compact);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
};

export const escapePlainText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeLinks = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const link of Array.from(template.content.querySelectorAll('a'))) {
    const href = link.getAttribute('href');
    if (!href || !isSafeMarkdownHref(href)) link.removeAttribute('href');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  return template.innerHTML;
};

export const sanitizeMarkdownHtml = (html: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return escapePlainText(html).replace(/\r?\n/g, '<br />');
  }
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: markdownTags,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  return normalizeLinks(clean);
};

export const sanitizeMermaidSvg = (svg: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'style'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror'],
    ALLOW_DATA_ATTR: false,
  });
};

export const renderSafeMarkdown = (
  markdown: string,
  parser?: MarkdownParser,
) => {
  const markdownParser = parser ?? (
    typeof window !== 'undefined' ? window.marked as MarkdownParser | undefined : undefined
  );
  if (!markdownParser?.parse) {
    return escapePlainText(markdown).replace(/\r?\n/g, '<br />');
  }
  return sanitizeMarkdownHtml(markdownParser.parse(markdown));
};

declare global {
  interface Window {
    marked?: MarkdownParser;
  }
}

type MarkdownParser = {
  parse: (markdown: string) => string;
};

const allowedTags = new Set([
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'ul',
]);

const removedWithContent = new Set([
  'base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta',
  'object', 'script', 'select', 'style', 'svg', 'textarea', 'video', 'audio',
]);

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

const sanitizeElement = (element: Element) => {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const childElement = child as Element;
    const tag = childElement.tagName.toLowerCase();
    if (removedWithContent.has(tag)) {
      childElement.remove();
      continue;
    }
    if (!allowedTags.has(tag)) {
      sanitizeElement(childElement);
      childElement.replaceWith(...Array.from(childElement.childNodes));
      continue;
    }

    for (const attribute of Array.from(childElement.attributes)) {
      const name = attribute.name.toLowerCase();
      const keep = tag === 'a' && (name === 'href' || name === 'title');
      if (!keep) childElement.removeAttribute(attribute.name);
    }

    if (tag === 'a') {
      const href = childElement.getAttribute('href');
      if (!href || !isSafeMarkdownHref(href)) {
        childElement.removeAttribute('href');
      } else {
        childElement.setAttribute('rel', 'noopener noreferrer');
      }
    }

    sanitizeElement(childElement);
  }
};

export const sanitizeMarkdownHtml = (html: string) => {
  if (typeof DOMParser === 'undefined') {
    return escapePlainText(html).replace(/\r?\n/g, '<br />');
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  sanitizeElement(document.body);
  return document.body.innerHTML;
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

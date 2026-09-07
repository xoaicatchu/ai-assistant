import { marked, Renderer } from 'marked';
import { sanitizeAssistantText } from '../../domain/chat/assistant-text';

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const renderer = new Renderer();
renderer.html = ({ text }) => text.replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
renderer.link = function ({ href, title, tokens }) {
  const safeHref = sanitizeLinkHref(href);
  const text = this.parser.parseInline(tokens);
  if (!safeHref) {
    return text;
  }

  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(safeHref)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

export function renderMarkdown(markdown: string): string {
  return marked.parse(sanitizeAssistantText(markdown), {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  });
}

function sanitizeLinkHref(href: string): string | null {
  const value = href.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return value;
  }

  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' ? value : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
}

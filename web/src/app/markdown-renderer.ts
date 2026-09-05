import { marked, Renderer } from 'marked';

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const renderer = new Renderer();
renderer.html = ({ text }) => text.replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  });
}

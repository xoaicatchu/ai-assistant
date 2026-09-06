const hiddenTagName = '(?:thinking|think|tool[\\s_-]*call|web[\\s_-]*search|search[\\s_-]*web|read[\\s_-]*url|read[\\s_-]*web[\\s_-]*page)';
const hiddenBlockPattern = new RegExp(
  `<${hiddenTagName}(?=[\\s>/])[^>]*>[\\s\\S]*?(?:</${hiddenTagName}\\s*>|$)`,
  'giu',
);
const standaloneInvocationPattern = /^\s*(?:web[\\s_-]*search|read[\\s_-]*url)(?:\s+with\s+snippets)?\s*(?:\([^\)\r\n]*\)|\[[^\]\r\n]*\]|\{[^}\r\n]*\})\s*$/gimu;
const orphanClosingMarkerPattern = new RegExp(`^\\s*</${hiddenTagName}\\s*>\\s*$`, 'gimu');
const legacyInvocationPattern = /^\s*(?:search[\s_-]*web|read[\s_-]*web[\s_-]*page)(?:\s+with\s+snippets)?\s*(?:\([^\)\r\n]*\)|\[[^\]\r\n]*\]|\{[^}\r\n]*\})\s*$/gimu;
const hiddenTagPrefixes = [
  '<thinking', '</thinking', '<think', '</think',
  '<tool_call', '</tool_call', '<tool-call', '</tool-call',
  '<web search', '</web search', '<web_search', '</web_search',
  '<search web', '</search web', '<search_web', '</search_web',
  '<read url', '</read url', '<read_url', '</read_url',
  '<read webpage', '</read webpage', '<read_webpage', '</read_webpage',
];

/**
 * Removes provider-internal search markup before text reaches the UI or is copied/shared.
 * The trailing-block handling also keeps an unfinished streamed tool call invisible.
 */
export function sanitizeAssistantText(content: string): string {
  let removedHiddenBlock = false;
  let removedTrailingHiddenBlock = false;
  let sanitized = content.replace(hiddenBlockPattern, (match, offset: number, source: string) => {
    removedHiddenBlock = true;
    removedTrailingHiddenBlock ||= offset + match.length === source.length;
    return '';
  });

  sanitized = sanitized
    .replace(standaloneInvocationPattern, '')
    .replace(legacyInvocationPattern, '')
    .replace(orphanClosingMarkerPattern, '');

  const partialTagStart = sanitized.lastIndexOf('<');
  if (partialTagStart >= 0) {
    const partialTag = sanitized.slice(partialTagStart).toLowerCase();
    if (hiddenTagPrefixes.some((prefix) => prefix.startsWith(partialTag))) {
      sanitized = sanitized.slice(0, partialTagStart);
      removedHiddenBlock = true;
      removedTrailingHiddenBlock = true;
    }
  }

  if (removedHiddenBlock) {
    sanitized = sanitized.replace(/^\s+/u, '').replace(/\n{3,}/gu, '\n\n');
  }

  return removedTrailingHiddenBlock ? sanitized.replace(/[ \t\r\n]+$/u, '') : sanitized;
}

const toolCallBlockPattern = /<tool_call\b[^>]*(?:>[\s\S]*?(?:<\/tool_call>|$)|$)/giu;
const standaloneInvocationPattern = /^\s*web_search(?:\s+with\s+snippets)?\s*(?:\([^\)\r\n]*\)|\[[^\]\r\n]*\]|\{[^}\r\n]*\})\s*$/gimu;
const orphanClosingMarkerPattern = /^\s*<\/tool_call>\s*$/gimu;

/**
 * Removes provider-internal search markup before text reaches the UI or is copied/shared.
 * The trailing-block handling also keeps an unfinished streamed tool call invisible.
 */
export function sanitizeAssistantText(content: string): string {
  let removedTrailingToolCall = false;
  let sanitized = content.replace(toolCallBlockPattern, (match, offset: number, source: string) => {
    removedTrailingToolCall ||= offset + match.length === source.length;
    return '';
  });

  sanitized = sanitized
    .replace(standaloneInvocationPattern, '')
    .replace(orphanClosingMarkerPattern, '');

  return removedTrailingToolCall ? sanitized.replace(/[ \t\r\n]+$/u, '') : sanitized;
}

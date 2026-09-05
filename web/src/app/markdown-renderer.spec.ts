import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown-renderer';

describe('renderMarkdown', () => {
  it('renders common GitHub-flavored Markdown blocks as HTML', () => {
    const html = renderMarkdown('## Kết quả\n\n**Đã xong**\n\n- nhanh\n- rõ ràng\n\n`dotnet test`');

    expect(html).toContain('<h2>Kết quả</h2>');
    expect(html).toContain('<strong>Đã xong</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>nhanh</li>');
    expect(html).toContain('<code>dotnet test</code>');
  });

  it('does not pass raw HTML through to the rendered message', () => {
    const html = renderMarkdown('<script>alert("xss")</script>\n\n**an toàn**');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>an toàn</strong>');
  });
});

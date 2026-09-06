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

  it('opens source links in a separate tab so the chat page stays mounted', () => {
    const html = renderMarkdown('[Nguồn thời tiết](https://example.com/weather)');

    expect(html).toContain('href="https://example.com/weather"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('removes unsafe link protocols instead of rendering them as clickable links', () => {
    const html = renderMarkdown('[Liên kết xấu](javascript:alert(1))');

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('Liên kết xấu');
  });
});

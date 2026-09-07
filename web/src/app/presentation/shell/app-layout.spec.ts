import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shellStyles = readFileSync(resolve(process.cwd(), 'src/app/presentation/shell/app.css'), 'utf8');
const globalStyles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('chat shell visual contract', () => {
  it('keeps assistant messages transparent and reserves the tinted surface for user bubbles', () => {
    expect(shellStyles).toMatch(/\.assistant-row \.message-bubble\s*\{[\s\S]*?background:\s*transparent/);
    expect(globalStyles).toMatch(/\.app-shell\.dark-mode \.message-bubble\s*\{[\s\S]*?background:\s*transparent !important/);
    expect(globalStyles).toMatch(/\.app-shell\.dark-mode \.user-row \.message-bubble\s*\{[\s\S]*?background:\s*#1f2937 !important/);
  });

  it('keeps the desktop content rail and fixed composer aligned', () => {
    expect(shellStyles).toMatch(/\.conversation\s*\{[\s\S]*?width:\s*min\(100%,\s*var\(--content-rail\)\)/);
    expect(shellStyles).toMatch(/\.composer\s*\{[\s\S]*?width:\s*min\(calc\(100% - 40px\),\s*var\(--content-rail\)\)/);
    expect(globalStyles).toMatch(/\.chat-footer\s*\{[\s\S]*?position:\s*fixed/);
  });
});

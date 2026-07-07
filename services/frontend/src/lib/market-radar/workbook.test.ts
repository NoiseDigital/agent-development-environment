import { describe, it, expect } from 'vitest';
import { buildWorkbookXml, type Sheet } from './workbook';

describe('buildWorkbookXml', () => {
  it('emits one worksheet per sheet with its name', () => {
    const sheets: Sheet[] = [
      { name: 'Alpha', columns: ['A'], rows: [['x']] },
      { name: 'Beta', columns: ['B'], rows: [[1]] },
    ];
    const xml = buildWorkbookXml(sheets);
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('ss:Name="Alpha"');
    expect(xml).toContain('ss:Name="Beta"');
  });

  it('types numbers as Number and text as String', () => {
    const xml = buildWorkbookXml([{ name: 'S', columns: ['n', 't'], rows: [[42, 'hi']] }]);
    expect(xml).toContain('<Data ss:Type="Number">42</Data>');
    expect(xml).toContain('<Data ss:Type="String">hi</Data>');
  });

  it('escapes XML-hostile characters in text', () => {
    const xml = buildWorkbookXml([{ name: 'S', columns: ['c'], rows: [['a & b < c > "d"']] }]);
    expect(xml).toContain('a &amp; b &lt; c &gt; &quot;d&quot;');
  });

  it('sanitises invalid / overlong sheet names', () => {
    const long = 'Observed vs Estimated / by [market]';
    const xml = buildWorkbookXml([{ name: long, columns: ['c'], rows: [] }]);
    // No raw : \ / ? * [ ] survive in the ss:Name attribute, and it is ≤ 31 chars.
    const m = xml.match(/ss:Name="([^"]*)"/);
    expect(m).not.toBeNull();
    const name = m![1];
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });
});

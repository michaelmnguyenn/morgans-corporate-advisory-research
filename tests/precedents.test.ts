import { describe, expect, it } from 'vitest';
import { groupCandidates, isRaiseHeadline, parseArchiveHtml, similarity, type ArchiveRow } from '../lib/precedents';

const doc = (id: string, date: string, title: string): ArchiveRow => ({ id, date, title, url: `https://www.asx.com.au/asx/v2/statistics/displayAnnouncement.do?display=pdf&idsId=${id}`, priceSensitive: true });

describe('ASX archive research', () => {
  it('reads archive links and dates, retaining likely equity raising titles', () => {
    const html = `<h2>Search results: Company announcements for PDN</h2>Released between 01/01/2025 and 31/12/2025
      <table><tr><td>16/09/2025<br><span>8:42 am</span></td><td><img src="/icon-price-sensitive.svg"></td><td><a href="/asx/v2/statistics/displayAnnouncement.do?display=pdf&amp;idsId=02995638">A$300M Fully Underwritten Equity Raising<br></a></td></tr>
      <tr><td>17/09/2025</td><td></td><td><a href="/asx/v2/statistics/displayAnnouncement.do?display=pdf&amp;idsId=02996214">Share Purchase Plan Opens<br></a></td></tr>
      <tr><td>18/09/2025</td><td></td><td><a href="/asx/v2/statistics/displayAnnouncement.do?display=pdf&amp;idsId=02996215">Quarterly report<br></a></td></tr></table>`;
    const parsed = parseArchiveHtml(html, 2025);
    expect(parsed.totalRows).toBe(3);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ id: '02995638', date: '2025-09-16', priceSensitive: true });
    expect(parsed.rows[0].url).toContain('idsId=02995638');
  });

  it('does not mistake capital notes or old placement litigation for new equity deals', () => {
    expect(isRaiseHeadline('ANZ completes Capital Notes 8 bookbuild')).toBe(false);
    expect(isRaiseHeadline('ANZ appeals Court decision on 2015 Placement')).toBe(false);
    expect(isRaiseHeadline('Employee share placement')).toBe(false);
    expect(isRaiseHeadline('TBN: Tamboran completes equity raise', 'APA')).toBe(false);
    expect(isRaiseHeadline('Financial Close of A$0.8 billion US Private Placement', 'TCL')).toBe(false);
    expect(isRaiseHeadline('Retail entitlement offer completed')).toBe(true);
  });

  it('groups nearby notices as unverified leads and favours same-sector structures', () => {
    const rows = [doc('1', '2025-09-16', 'Placement and Share Purchase Plan'), doc('2', '2025-09-17', 'Placement completed'), doc('3', '2026-01-10', 'Entitlement offer')];
    const grouped = groupCandidates('PDN', 'Paladin', 'Energy', rows);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ structure: 'mixed', status: 'unverified', lastDate: '2025-09-17' });
    const peer = groupCandidates('ABC', 'ABC', 'Energy', [doc('4', '2025-11-01', 'Placement and SPP announced')])[0];
    expect(similarity(grouped[0], peer)).toBeGreaterThan(similarity(grouped[1], peer));
  });
});

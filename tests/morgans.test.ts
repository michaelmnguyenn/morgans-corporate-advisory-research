import {describe,it,expect} from 'vitest';
import {MorgansDatasetSchema,comparisonTsv,excelCell} from '../lib/morgans';
import data from '../data/morgans-deals.json';
describe('Morgans comparison export',()=>{
 it('preserves reference basis, placement scope and sources when copied to Excel',()=>{
  const d=MorgansDatasetSchema.parse(data);
  const g50=d.deals.find(d=>d.ticker==='G50')!,ebr=d.deals.find(d=>d.ticker==='EBR')!;
  const text=comparisonTsv([g50,ebr]);
  expect(text.split('\n')).toHaveLength(3);
  expect(text).toContain('5-day VWAP');expect(text).toContain('Placement only; excludes separate SPP');
  expect(text).toContain(ebr.sources[1].url);
  expect(text.split('\n').map(r=>r.split('\t').length)).toEqual([13,13,13]);
 });
 it('prevents text formulas and row injection without corrupting numeric premiums',()=>{
  expect(excelCell('=HYPERLINK("test")')).toBe('\'=HYPERLINK("test")');
  expect(excelCell('Issuer\tname\nnext row')).toBe('Issuer name next row');
  expect(excelCell(-2.5)).toBe('-2.5');
 });
 it('rejects records without source documents and duplicate event identities',()=>{
  const bad=structuredClone(data);bad.deals[0].sources=[];
  expect(MorgansDatasetSchema.safeParse(bad).success).toBe(false);
  const dup=structuredClone(data);dup.deals.push(dup.deals[0]);
  expect(MorgansDatasetSchema.safeParse(dup).success).toBe(false);
 });
});

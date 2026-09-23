import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseFeed, safeUrl, type Source } from './pipeline';
import { partitionRecords, releaseIssues, validateDeal, RoundingSchema } from './validation';
import type { Deal } from '../lib/schema';

const source: Source = { id: 'issuer', name: 'Issuer feed', url: 'https://issuer.example/feed.json', adapter: 'json-feed', enabled: true, accessReviewed: true, allowedHosts: ['issuer.example'], rightsNote: 'Test fixture only', reviewedAt: '2026-01-01' };
function fixture(): Deal {
  const deal: Deal = {
    id:'fixture',ticker:'FIX',company:'Synthetic fixture only',date:'2026-01-01',completionDate:'2026-01-07',stage:'exploration',sector:'Resources',structure:'Placement',purpose:'Exploration',managers:[],cornerstone:'unknown',cornerstoneName:null,underwritten:'unknown',sharesPreM:100,lastClose:0.12,lastCloseDate:'2025-12-31',vwap5:null,vwap15:null,advAudM:null,advMethod:null,resumptionDate:null,close1:null,close30:null,capacitySharesM:null,cashPreM:null,debtPreM:null,feesM:null,repaymentM:null,otherUsesM:null,newDebtM:null,stageNote:'Issuer was conducting exploration at launch.',notes:[],
    legs:[{id:'placement',name:'Placement',structure:'Placement',price:0.1,announcedM:1,completedM:1,issuedSharesM:10,completionDate:'2026-01-07',status:'completed',sourceIds:['proof']}],
    sources:[{id:'proof',title:'Synthetic test evidence',url:'https://issuer.example/proof.pdf',date:'2026-01-07',page:'1',excerpt:'Synthetic fixture, never a production transaction.'}],fieldSources:{}
  };
  for (const key of ['date','completionDate','stage','lastCloseDate','sharesPreM','lastClose', ...['price','announcedM','completedM','issuedSharesM','completionDate'].map(key=>`legs.placement.${key}`)]) deal.fieldSources[key]=['proof'];
  return deal;
}
test('JSON feed discovery is stable, filters unrelated headlines and stays unresolved',()=>{
  const feed=JSON.stringify({items:[{title:'Placement completed',url:'https://issuer.example/a.pdf',date_published:'2026-01-07'},{title:'Board appointment',url:'https://issuer.example/b.pdf'}]});
  const first=parseFeed(source,feed,'2026-01-08'); const next=parseFeed(source,feed,'2026-01-09');
  assert.equal(first.length,1); assert.equal(first[0].id,next[0].id); assert.equal(first[0].contentHash,next[0].contentHash); assert.equal(first[0].state,'unresolved');
});
test('RSS accepts CDATA and rejects entities, wrong formats and external targets',()=>{
  const rss={...source,adapter:'rss' as const};
  assert.equal(parseFeed(rss,'<rss><channel><item><title><![CDATA[Placement &amp; SPP]]></title><link>https://issuer.example/a.pdf</link></item></channel></rss>')[0].title,'Placement & SPP');
  assert.throws(()=>parseFeed(rss,'<!DOCTYPE rss><rss/>'));
  assert.throws(()=>parseFeed(rss,'<html>Unavailable</html>'));
  assert.throws(()=>parseFeed(source,JSON.stringify({items:[{title:'Placement',url:'https://different.example/a'}]})));
});
test('feed URL allowlist permits an explicitly listed ASX host and rejects unsafe URLs',()=>{
  assert.equal(safeUrl('https://asx.com.au/a',['asx.com.au']).hostname,'asx.com.au');
  assert.equal(safeUrl('https://asx.api.markitdigital.com/a',['asx.api.markitdigital.com']).hostname,'asx.api.markitdigital.com');
  assert.throws(()=>safeUrl('https://asx.com.au/a',['issuer.example']));
  for(const url of ['http://issuer.example/a','https://localhost/a','https://127.0.0.1/a','https://issuer.example:444/a','https://user:password@issuer.example/a']) assert.throws(()=>safeUrl(url,['issuer.example','localhost','127.0.0.1']));
});
test('complete evidence passes and any missing core fact or provenance is quarantined',()=>{
  const good=fixture(); assert.deepEqual(releaseIssues(validateDeal(good)),[]);
  for(const mutation of [ (d:Deal)=>{d.lastClose=null;},(d:Deal)=>{d.sharesPreM=null;},(d:Deal)=>{d.stage='unknown';},(d:Deal)=>{d.legs[0].issuedSharesM=null;},(d:Deal)=>{delete d.fieldSources['legs.placement.price'];},(d:Deal)=>{d.sources[0].excerpt='';},(d:Deal)=>{d.sources[0].page=null;}]) {
    const d=fixture();mutation(d);assert.equal(partitionRecords([d]).quarantined.length,1);
  }
  const d=fixture();d.cashPreM=5;assert.match(releaseIssues(d).join(' '),/cashPreM/);
});
test('rounded proceeds need explicit source precision and cannot get a percentage tolerance',()=>{
  const d=fixture();d.legs[0].completedM=1.01;
  assert.match(releaseIssues(d).join(' '),/do not reconcile/);
  const rounding=RoundingSchema.parse({'fixture/placement':{proceedsUnitM:0.1,sourceId:'proof',note:'Reported proceeds rounded to the nearest A$0.1 million.'}});
  assert.deepEqual(releaseIssues(d,rounding),[]);
  d.legs[0].completedM=1.1;assert.match(releaseIssues(d,rounding).join(' '),/do not reconcile/);
  assert.throws(()=>RoundingSchema.parse({'fixture/placement':{proceedsUnitM:100,sourceId:'proof',note:'Excessive rounding'}}));
});
test('invalid dates, duplicate events, duplicate legs and unknown sources fail closed',()=>{
  assert.throws(()=>partitionRecords([fixture(),fixture()]));
  const a=fixture();a.legs.push(a.legs[0]);assert.equal(partitionRecords([a]).valid.length,0);
  const b=fixture();b.fieldSources.lastClose=['missing'];assert.equal(partitionRecords([b]).valid.length,0);
  const c=fixture();c.completionDate='2026-01-08';assert.equal(partitionRecords([c]).valid.length,0);
});
const repo=resolve('.');
function cli(script:string,cwd:string,args:string[]=[]){return spawnSync(process.execPath,[join(repo,'node_modules/tsx/dist/cli.mjs'),join(repo,'scripts',script),...args],{cwd,encoding:'utf8',env:{...process.env,DATABASE_URL:''}});}
test('import and release preserve partial records, publish only complete events, count unresolved and retain last good snapshot on failure',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'asx-pipeline-'));
  try {
    await mkdir(join(cwd,'data'));await mkdir(join(cwd,'.local/pipeline'),{recursive:true});
    const previous={version:'previous',generatedAt:'2026-01-01T00:00:00Z',coverage:{description:'Test only',announcementsCheckedThrough:null,pricesAsOf:null,lastAttemptAt:null,lastSuccessAt:null,sourceCount:0,unresolvedCount:0,historicalStart:null,scope:'Test fixture'},deals:[]};
    await writeFile(join(cwd,'data/release.json'),JSON.stringify(previous));await writeFile(join(cwd,'data/source-registry.json'),' {"sources":[]}');
    const partial={id:'partial',notes:['Needs research']};
    await writeFile(join(cwd,'input.json'),JSON.stringify([fixture(),partial]));
    assert.equal(cli('import.ts',cwd,['input.json']).status,0);
    assert.equal(JSON.parse(await readFile(join(cwd,'.local/records.json'),'utf8')).length,2);
    assert.equal(cli('import.ts',cwd,['input.json']).status,0);
    assert.equal(JSON.parse(await readFile(join(cwd,'.local/records.json'),'utf8')).length,2);
    const release=cli('release.ts',cwd);assert.equal(release.status,0,release.stderr);
    const published=JSON.parse(await readFile(join(cwd,'data/release.json'),'utf8'));assert.equal(published.deals.length,1);assert.equal(published.coverage.unresolvedCount,1);
    await writeFile(join(cwd,'.local/records.json'),JSON.stringify([partial]));
    assert.equal(cli('release.ts',cwd).status,1);
    assert.deepEqual(JSON.parse(await readFile(join(cwd,'data/release.json'),'utf8')),published);
  } finally {await rm(cwd,{recursive:true,force:true});}
});
test('empty feed registry reports no unattended coverage and database is optional',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'asx-update-'));
  try {await mkdir(join(cwd,'data'));await writeFile(join(cwd,'data/source-registry.json'),'{"sources":[]}');const update=cli('update.ts',cwd);assert.equal(update.status,0,update.stderr);assert.match(update.stdout,/No permitted unattended feed/);assert.equal(cli('database.ts',cwd,['check']).status,1);}finally{await rm(cwd,{recursive:true,force:true});}
});

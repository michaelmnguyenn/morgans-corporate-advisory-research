import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { z } from 'zod';

export const SourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), name: z.string(), url: z.string().url(),
  adapter: z.enum(['json-feed', 'rss']), enabled: z.boolean(), accessReviewed: z.boolean(),
  allowedHosts: z.array(z.string()).min(1), rightsNote: z.string(), reviewedAt: z.string().nullable(),
});
export const RegistrySchema = z.object({ sources: z.array(SourceSchema) });
export type Source = z.infer<typeof SourceSchema>;
export type Candidate = { id: string; sourceId: string; title: string; url: string; publishedAt: string | null; discoveredAt: string; contentHash: string; state: 'unresolved'; reason: string };
export type Cursor = { etag?: string; lastModified?: string; lastAttemptAt: string; lastSuccessAt?: string; contentHash?: string; error?: string };
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}
export function safeUrl(raw: string, allowedHosts: string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !allowedHosts.includes(url.hostname)) throw new Error('URL must use HTTPS and an exact allowlisted host');
  if (isIP(url.hostname) || url.hostname === 'localhost' || !url.hostname.includes('.') || /(^|\.)(local|internal)$/.test(url.hostname)) throw new Error('Local addresses are forbidden');
  if (/(^|\.)asx\.com\.au$/.test(url.hostname) || /(^|\.)asxonline\.com$/.test(url.hostname)) throw new Error('ASX automated access is not supported');
  return url;
}
function privateAddress(ip: string): boolean {
  if (ip.includes(':')) return !/^2|^3/.test(ip); // Only globally routable unicast IPv6.
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
}
export async function fetchSource(source: Source, cursor?: Cursor) {
  if (!source.enabled || !source.accessReviewed || !source.reviewedAt || !source.rightsNote.trim()) throw new Error('Source has no reviewed access permission');
  const url = safeUrl(source.url, source.allowedHosts);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error('Host resolves to a private address');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    'User-Agent': 'ASXRaiseCompsResearch/1.0', ...(cursor?.etag ? { 'If-None-Match': cursor.etag } : {}), ...(cursor?.lastModified ? { 'If-Modified-Since': cursor.lastModified } : {}),
  } });
  if (response.status === 304) return { unchanged: true as const };
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}; cursor retained`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty feed');
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > 2_000_000) { await reader.cancel(); throw new Error('Feed exceeds 2 MB budget'); } chunks.push(item.value); }
  return { unchanged: false as const, body: Buffer.concat(chunks).toString('utf8'), etag: response.headers.get('etag') ?? undefined, lastModified: response.headers.get('last-modified') ?? undefined };
}
const decode = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
export function parseFeed(source: Source, body: string, now = new Date().toISOString()): Candidate[] {
  let items: { title: string; url: string; publishedAt: string | null }[];
  if (source.adapter === 'json-feed') {
    const feed = z.object({ items: z.array(z.object({ title: z.string(), url: z.string().url(), date_published: z.string().optional() })) }).parse(JSON.parse(body));
    items = feed.items.map(item => ({ title: item.title, url: item.url, publishedAt: item.date_published ?? null }));
  } else {
    if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error('External entities are not allowed');
    if (!/<rss[\s>]/i.test(body)) throw new Error('Expected RSS 2.0 feed');
    items = [...body.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map(match => {
      const tag = (name: string) => decode(match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '');
      return { title: tag('title'), url: tag('link'), publishedAt: tag('pubDate') || null };
    });
  }
  return items.filter(item => /placement|capital rais|entitlement|rights issue|share purchase|allotment|issue results|shortfall/i.test(item.title)).map(item => {
    safeUrl(item.url, source.allowedHosts);
    const date = item.publishedAt ? new Date(item.publishedAt) : null;
    return { ...item, publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null, id: hash(`${source.id}:${item.url}`), sourceId: source.id, discoveredAt: now, contentHash: hash(JSON.stringify(item)), state: 'unresolved' as const, reason: 'Discovery only; source text, launch, completion and field evidence need verification.' };
  });
}

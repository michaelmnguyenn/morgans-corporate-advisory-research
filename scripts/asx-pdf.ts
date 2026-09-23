// Fetches an ASX announcement PDF through the access-terms page and caches its text in .local/terms.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cache = '.local/terms';
const python = existsSync('.local/pdf-venv/bin/python') ? resolve('.local/pdf-venv/bin/python') : 'python3';
const agent = 'Mozilla/5.0 (research; equity precedents)';
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

export async function pdfText(id: string, url: string): Promise<string | null> {
  await mkdir(cache, { recursive: true });
  const path = `${cache}/${id}.txt`;
  if (existsSync(path)) return readFile(path, 'utf8');
  const page = await fetch(url, { headers: { 'User-Agent': agent } });
  const html = await page.text();
  const pdfUrl = html.match(/name="pdfURL" value="([^"]+)"/)?.[1];
  await pause(700);
  if (!pdfUrl || new URL(pdfUrl).hostname !== 'announcements.asx.com.au') return null;
  const pdf = await fetch(pdfUrl, { headers: { 'User-Agent': agent } });
  if (!pdf.ok) return null;
  const file = `${cache}/${id}.pdf`;
  await writeFile(file, Buffer.from(await pdf.arrayBuffer()));
  await pause(700);
  const result = spawnSync(python, ['-c', 'from pypdf import PdfReader; import sys\nr=PdfReader(sys.argv[1])\nprint(chr(12).join((p.extract_text() or "") for p in r.pages[:12]))', file], { encoding: 'utf8', maxBuffer: 50_000_000, timeout: 60_000 });
  if (result.status !== 0) return null;
  await writeFile(path, result.stdout);
  return result.stdout;
}

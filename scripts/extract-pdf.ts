import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { atomicJson, hash } from './pipeline';

async function main() {
  const path = process.argv[2];
  if (!path || !path.toLowerCase().endsWith('.pdf')) throw new Error('Usage: npm run data:pdf -- /absolute/path/document.pdf');
  const absolute = resolve(path);
  const bytes = await readFile(absolute);
  if (bytes.length > 30_000_000) throw new Error('PDF exceeds 30 MB local worker limit');
  if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Not a PDF');
  const id = hash(bytes.toString('base64'));
  const folder = `.local/extracted/${id}`;
  await mkdir(folder, { recursive: true });
  const result = spawnSync('pdftotext', ['-layout', absolute, '-'], { timeout: 30000, maxBuffer: 20_000_000, encoding: 'utf8' });
  let text = result.stdout; let method = 'pdftotext-layout';
  if (result.error || result.status !== 0) {
    const python = process.env.PDF_PYTHON || (existsSync('.local/pdf-venv/bin/python') ? resolve('.local/pdf-venv/bin/python') : 'python3');
    const fallback = spawnSync(python, ['-c', 'from pypdf import PdfReader; import sys; print(chr(12).join((p.extract_text(extraction_mode="layout") or "") for p in PdfReader(sys.argv[1]).pages))', absolute], { timeout: 30000, maxBuffer: 20_000_000, encoding: 'utf8' });
    if (fallback.error || fallback.status !== 0) throw new Error('PDF extraction requires Poppler or pypdf. Run: python3 -m venv .local/pdf-venv && .local/pdf-venv/bin/python -m pip install -r scripts/pdf-requirements.txt');
    text = fallback.stdout; method = 'pypdf-layout';
  }
  await writeFile(`${folder}/text.txt`, text);
  const pages = text.split('\f');
  const candidates = pages.flatMap((page, index) => page.split('\n').filter(line => /placement|entitlement|allot|issu.*shares|share purchase|\$\s*[\d,.]+|\d+(?:\.\d+)?\s*cents/i.test(line)).map(line => ({ page: index + 1, text: line.trim(), state: 'unresolved' })));
  await atomicJson(`${folder}/candidates.json`, { documentHash: id, originalFile: absolute, extractedAt: new Date().toISOString(), method, needsOcr: text.trim().length < 100, published: false, launchVerified: false, completionVerified: false, candidates });
  console.log(`Extracted ${pages.length} pages to ${folder}. Candidate lines are not verified transaction facts; no release was changed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

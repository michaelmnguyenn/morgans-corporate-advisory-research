'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { sydneyDate, type DailyItem, type DailySnapshot } from '@/lib/daily';

const storageKey = 'morgans-daily-research-v1';
const archive = 'https://www.asx.com.au/markets/trade-our-cash-market/historical-announcements';
const dateTime = (value: string) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(value));

export default function DailyWatch({ snapshot }: { snapshot: DailySnapshot }) {
  const [saved, setSaved] = useState<DailyItem[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'feed' | 'saved'>('feed');
  const [showFilings, setShowFilings] = useState(false);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isCurrent, setIsCurrent] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { items?: DailyItem[]; notes?: Record<string, string> };
      setSaved(Array.isArray(stored.items) ? stored.items : []);
      setNotes(stored.notes ?? {});
    } catch { /* Ignore a damaged device-local shortlist. */ }
    setIsCurrent(snapshot.marketDate === sydneyDate(new Date()));
    setReady(true);
  }, [snapshot.marketDate]);

  const persist = (items: DailyItem[], nextNotes = notes) => {
    setSaved(items);
    setNotes(nextNotes);
    localStorage.setItem(storageKey, JSON.stringify({ items, notes: nextNotes }));
  };
  const toggle = (item: DailyItem) => persist(saved.some(row => row.id === item.id) ? saved.filter(row => row.id !== item.id) : [item, ...saved]);
  const visible = useMemo(() => (view === 'saved' ? saved : snapshot.items)
    .filter(item => view === 'saved' || showFilings || item.kind === 'raise')
    .filter(item => `${item.ticker} ${item.company} ${item.headline} ${item.sector ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())), [view, saved, snapshot.items, showFilings, query]);
  const raises = snapshot.items.filter(item => item.kind === 'raise').length;

  return <main className="page daily-page">
    <header>
      <h1>Morgans Corporate Advisory Research</h1>
      <p className="byline">Michael Nguyen</p>
      <nav><Link href="/">Precedent model</Link><Link href="/today" aria-current="page">Daily watch</Link><Link href="/case-studies">Three deal studies</Link></nav>
    </header>
    <section aria-labelledby="daily-title">
      <div className="daily-heading">
        <div><h2 id="daily-title">ASX equity-raising watch</h2><p>Candidate announcements from {snapshot.marketDate || 'the latest check'}, not verified transactions.</p></div>
        <div className="daily-count"><strong>{raises}</strong><span>raise-related headlines</span></div>
      </div>
      <p className="daily-status">{snapshot.checkedAt ? `Checked ${dateTime(snapshot.checkedAt)} Sydney time across ${snapshot.scannedCount} announcements.` : 'No announcement check has run yet.'} {ready && !isCurrent && snapshot.checkedAt ? 'This is not a current-day check.' : ''}</p>
      <div className="daily-controls">
        <div className="daily-tabs" role="group" aria-label="Research view"><button type="button" aria-pressed={view === 'feed'} onClick={() => setView('feed')}>Latest check</button><button type="button" aria-pressed={view === 'saved'} onClick={() => setView('saved')}>Saved for review{ready ? ` (${saved.length})` : ''}</button></div>
        <label className="daily-search">Search announcements<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Company, ticker or headline" /></label>
      </div>
      {view === 'feed' && <label className="daily-option"><input type="checkbox" checked={showFilings} onChange={event => setShowFilings(event.target.checked)} /> Include proposed-issue and quotation notices</label>}
      <p className="daily-explain">Headlines identify possible raises; the amount, purpose and final terms still need checking in the company announcement. Saved items and notes stay in this browser only.</p>
      {visible.length ? <ol className="daily-list">{visible.map(item => <li key={item.id} className="daily-item">
        <div className="daily-item-top"><span className="daily-ticker">{item.ticker}</span><span>{item.sector ?? 'Sector not supplied'}</span><span>{dateTime(item.publishedAt)}</span><span className="daily-kind">{item.kind === 'raise' ? 'Raise headline' : 'Filing notice'}</span></div>
        <h3>{item.headline}</h3><p>{item.company}</p>
        <div className="daily-actions"><a href={archive} target="_blank" rel="noreferrer">Find filing on ASX</a><button type="button" onClick={() => toggle(item)}>{saved.some(row => row.id === item.id) ? 'Remove from review' : 'Save for review'}</button></div>
        {view === 'saved' && <label className="daily-note">Research note<textarea value={notes[item.id] ?? ''} onChange={event => persist(saved, { ...notes, [item.id]: event.target.value })} placeholder="Record the purpose, structure or reason this may be comparable" /></label>}
      </li>)}</ol> : <p className="daily-empty">{view === 'saved' ? 'Nothing saved yet. Open the latest check and save an announcement to review it.' : snapshot.checkedAt ? 'No announcements match these filters.' : 'Run the daily announcement check to fill this view.'}</p>}
    </section>
  </main>;
}

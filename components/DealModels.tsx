'use client';
import {useEffect,useState} from 'react';
import {dayMove,type MorgansDataset,type MorgansDeal,type PriceHistory} from '@/lib/morgans';
import {calculateRaise} from '@/lib/deal-model';
import {format,dateLabel} from '@/lib/model';

const C0='#1f77b4',C1='#ff7f0e',C3='#d62728';
const RESULT={ahead:'Beat',met:'Met',behind:'Missed'} as const;
const shortName=(d:MorgansDeal)=>d.company.replace(/ Holding Company Limited| Limited|, Inc\./g,'');
const pct=(v:number)=>`${v>=0?'+':'−'}${format(Math.abs(v),1)}%`;
const slug=(d:MorgansDeal)=>d.ticker.toLowerCase();

function priceSince(d:MorgansDeal,prices:PriceHistory){const stock=prices.series[d.ticker]??[],latest=stock[stock.length-1];return {stock,latest,pct:(latest[1]/d.price-1)*100};}
function sharesBefore(d:MorgansDeal){return d.capital?.sharesPreM??d.analysis.quotedBaseM??null;}
function model(d:MorgansDeal,offer=d.price){return calculateRaise({grossM:d.amountM,offer,reference:d.referencePrice,sharesPreM:sharesBefore(d),feesPct:null})!;}

export default function DealModels({research,prices}:{research:MorgansDataset;prices:PriceHistory}){
 const [page,setPage]=useState('overview');
 useEffect(()=>{const read=()=>{setPage(location.hash.slice(1)||'overview');window.scrollTo(0,0);};read();addEventListener('hashchange',read);return ()=>removeEventListener('hashchange',read);},[]);
 const d=research.deals.find(x=>slug(x)===page);
 return <main className="page">
  <header>
   <h1>Morgans Corporate Advisory Research</h1>
   <p className="byline">Michael Nguyen · September 2026 · Independent research, not affiliated with or endorsed by Morgans</p>
   <nav><a href="#overview" aria-current={!d?'page':undefined}>Overview</a>{research.deals.map(v=><a key={v.id} href={`#${slug(v)}`} aria-current={d?.id===v.id?'page':undefined}>{shortName(v)}</a>)}</nav>
  </header>
  {d?<Deal deal={d} prices={prices}/>:<Overview deals={research.deals} prices={prices}/>}
 </main>;
}

function Overview({deals,prices}:{deals:MorgansDeal[];prices:PriceHistory}){
 return <article>
  <h2>Three ASX equity raises</h2>
  <p>This note reviews three ASX equity raises on which Morgans acted as lead manager, covering an institutional placement, an accelerated non-renounceable entitlement offer and a placement of CDIs by a US-domiciled company. For each raise it sets out the use of funds and the reasons for the chosen structure, tests the outcome against the targets the company stated at launch, and measures the share price against the offer price.</p>
  <p>All three companies delivered most of what they said the capital was for, but only Wagners has delivered a positive return to investors who participated. The results suggest that the size of a raise relative to the milestone it has to fund matters more to investors than whether the stated targets are met.</p>
  <table><caption>Table 1. Summary of the three raises, share prices to {dateLabel(prices.checkedAt)}</caption>
   <thead><tr><th>Company</th><th>Date</th><th>Structure</th><th className="n">Raised (A$m)</th><th className="n">Offer (A$)</th><th className="n">Targets met</th><th className="n">Price vs offer</th><th>Assessment</th></tr></thead>
   <tbody>{deals.map(d=>{const r=priceSince(d,prices),ms=d.analysis.metrics;return <tr key={d.id}><td><a href={`#${slug(d)}`}>{shortName(d)}</a></td><td>{dateLabel(d.date)}</td><td>{d.structure}</td><td className="n">{format(d.amountM,1)}</td><td className="n">{format(d.price,2)}</td><td className="n">{ms.filter(m=>m.status!=='behind').length} of {ms.length}</td><td className="n">{pct(r.pct)}</td><td>{d.analysis.assessment?.summary}</td></tr>;})}</tbody>
  </table>
  <h3>Findings</h3>
  <ul>
   <li>Wagners: a modest placement priced close to market funded growth the company could already see, and the capital was deployed as stated.</li>
   <li>29Metals: the entitlement offer secured the company's funding, but the Xantho Extended restart it was sized around slipped by about eight months, and the share price fell 35% on the announcement.</li>
   <li>EBR: the company met every target it set, but investors who subscribed at A$1.00 are 73.5% behind after a follow-on raise at A$0.38 in June 2026.</li>
  </ul>
  <h3>Conclusion</h3>
  <p>Meeting the stated targets did not guarantee a good outcome for investors. The more useful question when assessing a raise is what milestone the capital needs to carry the company to, and whether the raise is large enough to get there, as that determines whether investors face a further raise at a lower price.</p>
  <h3>Method</h3>
  <p>Targets are taken from each company's launch announcement, and outcomes from the company's later reports and filings, which are linked next to each result. A target is marked as met where a later report shows it was achieved by the stated date. Share prices are daily closes from Yahoo Finance.</p>
  <h3>Limitations</h3>
  <ul>
   <li>The attribution of the 16 April 2026 fall in the 29Metals share price to the Xantho Extended deferral relies on market coverage published that day.</li>
   <li>Wagners did not set quantitative targets, so it is assessed against its stated uses of funds.</li>
   <li>EBR's dilution is calculated on quoted CDIs, as the full US share register could not be confirmed.</li>
  </ul>
 </article>;
}

function Deal({deal:d,prices}:{deal:MorgansDeal;prices:PriceHistory}){
 const a=d.analysis,m=model(d),r=priceSince(d,prices),unit=d.ticker==='EBR'?'CDIs':'shares';
 const quoted=!d.capital&&a.quotedBaseM?' (quoted CDIs)':'';
 const dates=[...new Set(a.metrics.flatMap(x=>x.date?[x.date]:[]))].sort();
 const metrics=[...a.metrics].sort((x,y)=>(x.date??'9').localeCompare(y.date??'9'));
 const hit=a.metrics.filter(x=>x.status!=='behind').length;
 const steps=[.8,.9,1,1.1,1.2];
 return <article>
  <h2>{shortName(d)} (ASX: {d.ticker})</h2>
  <p className="meta">{d.structure} · {dateLabel(d.date)} · A${format(d.amountM,1)}m at A${format(d.price,2)} · <a href={d.sources[0].url} target="_blank" rel="noreferrer">Launch announcement</a></p>

  <h3>1. Use of funds</h3>
  <ul>{a.purpose.map(v=><li key={v}>{v}</li>)}</ul>
  {a.split&&<table className="narrow"><thead><tr><th>{a.split.title.replace(/ \(A\$m\)/,'')}</th><th className="n">A$m</th></tr></thead><tbody>{a.split.parts.map(p=><tr key={p.label}><td>{p.label}</td><td className="n">{format(p.amountM,1)}</td></tr>)}<tr className="total"><td>Total</td><td className="n">{format(a.split.parts.reduce((t,p)=>t+p.amountM,0),1)}</td></tr></tbody></table>}

  <h3>2. How the offer worked</h3>
  <ul>{a.structure.map(v=><li key={v}>{v}</li>)}</ul>

  <h3>3. Why this structure</h3>
  <ul>{(a.rationale??[]).map(v=><li key={v}>{v}</li>)}</ul>

  <h3>4. Funding model</h3>
  <table className="narrow"><tbody>
   <tr><td>Gross proceeds (A$m)</td><td className="n">{format(d.amountM,1)}</td></tr>
   <tr><td>Offer price (A$)</td><td className="n">{format(d.price,3)}</td></tr>
   {d.referencePrice!==null&&<tr><td>Last close before the raise (A$)</td><td className="n">{format(d.referencePrice,3)}</td></tr>}
   {m.discount!==null&&<tr><td>Discount to last close (%)</td><td className="n">{format(m.discount,1)}</td></tr>}
   <tr><td>New {unit} issued (m)</td><td className="n">{format(m.issuedM,1)}</td></tr>
   {m.postM!==null&&<><tr><td>{unit==='CDIs'?'CDIs':'Shares'} on issue before the raise (m){quoted}</td><td className="n">{format(sharesBefore(d),1)}</td></tr>
   <tr><td>{unit==='CDIs'?'CDIs':'Shares'} on issue after the raise (m)</td><td className="n">{format(m.postM,1)}</td></tr>
   <tr className="total"><td>Dilution for holders who did not take part (%)</td><td className="n">{format(m.dilution,1)}</td></tr></>}
  </tbody></table>
  <p className="note">New {unit} = gross proceeds ÷ offer price. Dilution = new {unit} ÷ {unit} on issue after the raise.</p>

  <table className="narrow"><caption>Table 2. Sensitivity to the offer price, holding gross proceeds at A${format(d.amountM,1)}m</caption>
   <thead><tr><th className="n">Offer price (A$)</th>{d.referencePrice!==null&&<th className="n">Discount to last close (%)</th>}<th className="n">New {unit} (m)</th>{m.dilution!==null&&<th className="n">Dilution (%)</th>}</tr></thead>
   <tbody>{steps.map(s=>{const x=model(d,d.price*s);return <tr key={s} className={s===1?'total':''}><td className="n">{format(d.price*s,3)}{s===1?' (actual)':''}</td>{x.discount!==null&&<td className="n">{format(x.discount,1)}</td>}<td className="n">{format(x.issuedM,1)}</td>{x.dilution!==null&&<td className="n">{format(x.dilution,1)}</td>}</tr>;})}</tbody>
  </table>
  <IssuanceFigure deal={d} unit={unit}/>

  <h3>5. Outcome against stated targets</h3>
  <p>Targets met: {hit} of {a.metrics.length}. Share price at {dateLabel(r.latest[0])}: A${format(r.latest[1],3)}, {pct(r.pct)} against the offer price.</p>
  <table><caption>Table 3. Stated targets and outcomes</caption>
   <thead><tr><th>#</th><th>Measure</th><th>Stated at the raise</th><th>Outcome</th><th>Result</th><th className="n">Price on the day</th><th>Source</th></tr></thead>
   <tbody>{metrics.map(x=>{const mv=x.date?dayMove(r.stock,x.date):null;return <tr key={x.metric}><td>{x.date?dates.indexOf(x.date)+1:''}</td><td>{x.metric}</td><td>{x.target}</td><td>{x.result}</td><td className={x.status}>{RESULT[x.status]}</td><td className="n">{mv?<>{pct(mv.pct)}<br/><small>{dateLabel(mv.date)}</small></>:'–'}</td><td>{x.source?<a href={x.source.url} target="_blank" rel="noreferrer">{x.source.label}</a>:''}</td></tr>;})}</tbody>
  </table>
  <PriceFigure deal={d} prices={prices} dates={dates}/>
  {a.priceNotes.length>0&&<ul>{a.priceNotes.map(v=><li key={v}>{v}</li>)}</ul>}

  {a.assessment&&<><h3>6. Assessment</h3>{a.assessment.take.map(v=><p key={v}>{v}</p>)}<p><em>Key lesson:</em> {a.assessment.takeaway}</p></>}

  <h3>Sources</h3>
  <ol className="sources">{[...d.sources.map(v=>({title:v.title,url:v.url,date:v.date as string|undefined})),...(d.capital?[d.capital.source]:[]),...a.sources].filter((v,i,all)=>all.findIndex(o=>o.url===v.url)===i).map(v=><li key={v.url}><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a>{v.date?`, ${dateLabel(v.date)}`:''}</li>)}</ol>
 </article>;
}

// Plot helpers in the style of a default matplotlib figure.
function niceTicks(lo:number,hi:number,n=5){const raw=(hi-lo)/n,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(k=>k*mag).find(s=>s>=raw)!;const out:number[]=[];for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step)out.push(Number(v.toFixed(10)));return {ticks:out,step};}
const dp=(step:number)=>Math.max(0,-Math.floor(Math.log10(step)+1e-9));
const W=560,H=300,L=60,R=15,T=15,B=45;
function Axes({xTicks,yTicks,xLabel,yLabel}:{xTicks:{x:number;label:string}[];yTicks:{y:number;label:string}[];xLabel:string;yLabel:string}){
 return <g className="axes"><rect x={L} y={T} width={W-L-R} height={H-T-B} fill="none" stroke="#000" strokeWidth={0.8}/>
  {xTicks.map(t=><g key={t.label+t.x}><line x1={t.x} x2={t.x} y1={H-B} y2={H-B+4} stroke="#000" strokeWidth={0.8}/><text x={t.x} y={H-B+16} textAnchor="middle">{t.label}</text></g>)}
  {yTicks.map(t=><g key={t.label+t.y}><line x1={L-4} x2={L} y1={t.y} y2={t.y} stroke="#000" strokeWidth={0.8}/><text x={L-7} y={t.y+3.5} textAnchor="end">{t.label}</text></g>)}
  <text x={(L+W-R)/2} y={H-8} textAnchor="middle">{xLabel}</text><text transform={`translate(14 ${(T+H-B)/2}) rotate(-90)`} textAnchor="middle">{yLabel}</text></g>;
}
function Legend({items}:{items:{label:string;color:string;dash?:string;dot?:boolean}[]}){
 const w=Math.max(...items.map(i=>i.label.length))*6+40;
 return <g><rect x={W-R-w-8} y={T+8} width={w} height={items.length*17+8} fill="#fff" stroke="#ccc" rx={2}/>{items.map((i,k)=><g key={i.label} transform={`translate(${W-R-w} ${T+21+k*17})`}>{i.dot?<circle cx={10} cy={-3} r={3.5} fill={i.color}/>:<line x1={0} x2={20} y1={-3} y2={-3} stroke={i.color} strokeWidth={1.5} strokeDasharray={i.dash}/>}<text x={27} y={1}>{i.label}</text></g>)}</g>;
}

function IssuanceFigure({deal:d,unit}:{deal:MorgansDeal;unit:string}){
 const lo=d.price*.5,hi=d.price*1.25,pts=Array.from({length:60},(_,i)=>lo+(hi-lo)*i/59),ymax=d.amountM/lo;
 const xt=niceTicks(lo,hi),yt0=niceTicks(0,ymax),ytop=Math.ceil(ymax*1.02/yt0.step)*yt0.step,yt={step:yt0.step,ticks:Array.from({length:Math.round(ytop/yt0.step)+1},(_,i)=>i*yt0.step)};
 const X=(v:number)=>L+(v-lo)/(hi-lo)*(W-L-R),Y=(v:number)=>H-B-v/ytop*(H-T-B);
 return <figure><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`New ${unit} issued against offer price`}>
  <Axes xLabel="Offer price (A$)" yLabel={`New ${unit} (m)`} xTicks={xt.ticks.filter(v=>v>=lo&&v<=hi).map(v=>({x:X(v),label:v.toFixed(dp(xt.step))}))} yTicks={yt.ticks.map(v=>({y:Y(v),label:v.toFixed(dp(yt.step))}))}/>
  <path d={pts.map((p,i)=>`${i?'L':'M'}${X(p).toFixed(1)},${Y(d.amountM/p).toFixed(1)}`).join('')} fill="none" stroke={C0} strokeWidth={1.5}/>
  <line x1={X(d.price)} x2={X(d.price)} y1={Y(d.amountM/d.price)} y2={H-B} stroke={C1} strokeDasharray="4 3" strokeWidth={1.2}/><circle cx={X(d.price)} cy={Y(d.amountM/d.price)} r={4} fill={C1}/>
  <Legend items={[{label:`New ${unit} at A$${format(d.amountM,1)}m`,color:C0},{label:`Actual offer A$${format(d.price,2)}`,color:C1,dot:true}]}/>
 </svg><figcaption>Figure 1. New {unit} issued at different offer prices for the same gross proceeds.</figcaption></figure>;
}

function PriceFigure({deal:d,prices,dates}:{deal:MorgansDeal;prices:PriceHistory;dates:string[]}){
 const {stock}=priceSince(d,prices),n=stock.length,vals=[...stock.map(v=>v[1]),d.price];
 const yt=niceTicks(Math.min(...vals)*.95,Math.max(...vals)*1.05),y0=yt.ticks[0]>Math.min(...vals)?yt.ticks[0]-yt.step:yt.ticks[0],y1=yt.ticks[yt.ticks.length-1]<Math.max(...vals)?yt.ticks[yt.ticks.length-1]+yt.step:yt.ticks[yt.ticks.length-1];
 const X=(i:number)=>L+i/(n-1)*(W-L-R),Y=(v:number)=>H-B-(v-y0)/(y1-y0)*(H-T-B);
 const months=stock.map(v=>v[0].slice(0,7)),every=Math.max(1,Math.ceil(new Set(months).size/6));
 const xt=months.map((m,i)=>i&&m!==months[i-1]?i:-1).filter(i=>i>0).filter((_,k)=>k%every===0).map(i=>({x:X(i),label:stock[i][0].slice(0,7)}));
 const ticks=niceTicks(y0,y1).ticks.filter(v=>v>=y0-1e-9&&v<=y1+1e-9);
 return <figure><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${d.ticker} daily close against the offer price`}>
  <Axes xLabel="Date" yLabel="Share price (A$)" xTicks={xt} yTicks={ticks.map(v=>({y:Y(v),label:v.toFixed(dp(yt.step))}))}/>
  <line x1={L} x2={W-R} y1={Y(d.price)} y2={Y(d.price)} stroke={C1} strokeDasharray="5 3" strokeWidth={1.2}/>
  <path d={stock.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v[1]).toFixed(1)}`).join('')} fill="none" stroke={C0} strokeWidth={1.3}/>
  {dates.map((day,k)=>{const i=stock.findIndex(v=>v[0]>=day);if(i<0)return null;return <g key={day}><circle cx={X(i)} cy={Y(stock[i][1])} r={3.5} fill={C3}/><text x={X(i)+5} y={Y(stock[i][1])-6} fill={C3}>{k+1}</text></g>;})}
  <Legend items={[{label:`${d.ticker} close`,color:C0},{label:`Offer price A$${format(d.price,2)}`,color:C1,dash:'5 3'},...(dates.length?[{label:'Result reported (Table 3)',color:C3,dot:true}]:[])]}/>
 </svg><figcaption>Figure 2. {shortName(d)} daily closing price since the raise, against the offer price.</figcaption></figure>;
}

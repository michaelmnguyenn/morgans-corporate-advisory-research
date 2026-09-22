'use client';
import {useEffect,useState} from 'react';
import {dayMove,type MorgansDataset,type MorgansDeal,type PriceHistory} from '@/lib/morgans';
import {calculateRaise,type RaiseInputs} from '@/lib/deal-model';
import {format,dateLabel} from '@/lib/model';

type Assumptions={grossM:number|null;offer:number|null;sharesPreM:number|null;feesPct:number|null};
const defaults=(d:MorgansDeal):Assumptions=>({grossM:d.amountM,offer:d.price,sharesPreM:d.capital?.sharesPreM??null,feesPct:null});
export default function DealModels({research,prices}:{research:MorgansDataset;prices:PriceHistory}){
 const [id,setId]=useState('report'),[saved,setSaved]=useState<Record<string,Assumptions>>({}),[ready,setReady]=useState(false);
 useEffect(()=>{try{const parsed=JSON.parse(localStorage.getItem('asx-deal-models-v1')||'{}');const clean:Record<string,Assumptions>={};for(const d of research.deals){const row=parsed[d.id];if(row&&['grossM','offer','sharesPreM','feesPct'].every(k=>row[k]===null||typeof row[k]==='number'&&Number.isFinite(row[k])))clean[d.id]=row;}setSaved(clean);}catch{}setReady(true);},[research]);
 useEffect(()=>{if(ready)try{localStorage.setItem('asx-deal-models-v1',JSON.stringify(saved));}catch{}},[saved,ready]);
 const d=research.deals.find(d=>d.id===id);
 return <main className="workspace individual-workspace"><header className="masthead"><h1>Morgans Corporate Advisory Research by Michael Nguyen <span className="workbook-name">/ {d?d.company.replace(/ Holding Company Limited| Limited|, Inc\./g,''):'Overview'}</span></h1></header><div className="model-layout"><aside className="deal-list"><button className="report-link" aria-current={id==='report'?'page':undefined} onClick={()=>setId('report')}><strong>Overview</strong></button><p>Deals</p>{research.deals.map(v=><button key={v.id} aria-current={v.id===id?'page':undefined} onClick={()=>setId(v.id)}><strong>{v.ticker}</strong><span>{v.company.replace(/ Limited|, Inc\.| Corp/g,'')}</span><small>{dateLabel(v.date)} · A${format(v.amountM,0)}m</small></button>)}</aside>{d?<DealModel key={d.id} deal={d} prices={prices} inputs={saved[id]??defaults(d)} update={v=>setSaved(prev=>({...prev,[id]:v}))}/>:<Report deals={research.deals} prices={prices} open={setId}/>}</div></main>;
}
function DealModel({deal:d,prices,inputs:a,update}:{deal:MorgansDeal;prices:PriceHistory;inputs:Assumptions;update:(v:Assumptions)=>void}){
 const baseInputs:RaiseInputs={...defaults(d),reference:d.referencePrice};
 const base=calculateRaise(baseInputs)!;const model=calculateRaise({...a,reference:d.referencePrice});
 const changed=JSON.stringify(a)!==JSON.stringify(defaults(d));
 const shareAssumption=a.sharesPreM!==null&&a.sharesPreM!==d.capital?.sharesPreM;
 const delta=model?model.issuedM-base.issuedM:null;
 const unit=d.ticker==='EBR'?'CDIs':'shares';
 const updateOne=(key:keyof Assumptions,value:number|null)=>update({...a,[key]:value});
 function reset(){update(defaults(d));}
 return <article className="company-model">
  <div className="model-heading"><div><span className="model-kicker">{d.ticker} · {dateLabel(d.date)} · {d.structure}</span><h2>{d.company.replace(/ Holding Company Limited| Limited|, Inc\./g,'')}</h2></div><a className="launch-link" href={d.sources[0].url} target="_blank" rel="noreferrer">Launch announcement</a></div>
  <RaiseBrief deal={d}/>
  <div className="model-actions"><span>Scenario analysis:</span><button onClick={()=>update({...defaults(d),offer:Number((d.price*.9).toFixed(6))})}>Offer price 10% lower</button><button onClick={()=>update({...defaults(d),grossM:Number((d.amountM*1.25).toFixed(6))})}>Raise 25% more</button><button onClick={reset} disabled={!changed}>Reset to original</button></div>
  <div className="model-main">
   <section className="linked-model"><div className="section-heading"><h2>Funding model</h2><span>{changed?'Your scenario':'Original terms loaded'}</span></div><table><thead><tr><th>All amounts in A$ unless stated</th><th>Original terms</th><th>Your scenario</th></tr></thead><tbody>
    <tr><th>Gross proceeds (millions)</th><td className="input-number">{format(d.amountM,3)}</td><td><CellInput label="Scenario gross proceeds (A$m)" value={a.grossM} set={v=>updateOne('grossM',v)}/></td></tr>
    <tr><th>Offer price</th><td className="input-number">{format(d.price,4)}</td><td><CellInput label="Scenario offer price (A$)" value={a.offer} set={v=>updateOne('offer',v)}/></td></tr>
    {d.referencePrice!==null&&<ModelRow label="Discount to last close (%)" original={base.discount} scenario={model?.discount} dp={2}/>}
    <ModelRow label={`New ${unit} (millions)`} original={base.issuedM} scenario={model?.issuedM} dp={3} strong/>
    {a.sharesPreM!==null&&a.sharesPreM>0&&<><tr><th>Existing ordinary shares (millions){shareAssumption&&<small className="assumption-label">User assumption</small>}</th><td className="input-number">{format(d.capital?.sharesPreM??null,3)}</td><td className="input-number">{format(a.sharesPreM,3)}</td></tr><ModelRow label="Shares after this raise (millions)" original={base.postM} scenario={model?.postM} dp={3}/><ModelRow label="Non-participant dilution (%)" original={base.dilution} scenario={model?.dilution} dp={2} strong/></>}
    {a.feesPct!==null&&a.feesPct>=0&&a.feesPct<=100&&<><tr><th>Fee assumption (%)</th><td>Not assumed</td><td>{format(a.feesPct,2)}</td></tr><ModelRow label="Net proceeds (millions)" original={null} scenario={model?.netM} dp={3} strong/></>}
   </tbody></table>

   </section>
   <section className="interactive-model"><div className="section-heading"><h2>Offer price sensitivity</h2></div><div className="price-control"><label htmlFor={`price-${d.id}`}>Offer price <strong>A${format(a.offer,4)}</strong></label><input id={`price-${d.id}`} type="range" min={d.price*.5} max={d.price*1.25} step={d.price/1000} value={a.offer??d.price} onChange={e=>updateOne('offer',Number(e.target.value))}/><div><span>50% of original</span><span>125% of original</span></div></div>
   {model&&<><p className="scenario-explainer">{Math.abs(delta??0)<.0000001?<>At these terms, A${format(a.grossM,1)}m requires {format(model.issuedM,2)}m new {unit}.</>:<>To raise A${format(a.grossM,1)}m at A${format(a.offer,4)}, the company would issue <strong>{format(model.issuedM,2)}m {unit}</strong>, {format(Math.abs(delta!),2)}m {delta!>0?'more':'fewer'} than the original model.</>}</p><IssuanceChart deal={d} inputs={a} original={base.issuedM}/>{model.dilution!==null&&<div className="ownership"><h3>Ownership after the raise</h3><div className="ownership-bar" role="img" aria-label={`Existing share block ${format(100-model.dilution,1)} percent; newly issued share block ${format(model.dilution,1)} percent`}><span style={{width:`${100-model.dilution}%`}}/><span style={{width:`${model.dilution}%`}}/></div><p><span>Existing shares {format(100-model.dilution,1)}%</span><span>New shares {format(model.dilution,1)}%</span></p></div>}</>}
   {!model&&<p className="scenario-explainer" role="alert">Enter positive proceeds and an offer price to calculate this scenario.</p>}
   </section>
  </div>
  <RaiseReview deal={d} prices={prices}/>
  <details className="model-evidence"><summary>Sources</summary><div className="model-source-list">{[...d.sources.map(v=>({title:v.title,url:v.url,date:v.date as string|undefined})),...(d.capital?[d.capital.source]:[]),...d.analysis.sources].filter((v,i,all)=>all.findIndex(o=>o.url===v.url)===i).map(v=><a key={v.url} href={v.url} target="_blank" rel="noreferrer">{v.title}{v.date?` · ${dateLabel(v.date)}`:''}</a>)}</div></details>
 </article>;
}
function CellInput({label,value,set}:{label:string;value:number|null;set:(v:number|null)=>void}){return <input aria-label={label} type="number" min={0} step="any" value={value??''} onChange={e=>set(e.target.value===''?null:Number(e.target.value))}/>;}
function ModelRow({label,original,scenario,dp,strong=false}:{label:string;original:number|null;scenario:number|null|undefined;dp:number;strong?:boolean}){return <tr className={strong?'model-total':''}><th>{label}</th><td>{format(original,dp)}</td><td>{format(scenario??null,dp)}</td></tr>;}
function IssuanceChart({deal:d,inputs:a,original}:{deal:MorgansDeal;inputs:Assumptions;original:number}){
 const gross=a.grossM??d.amountM,min=d.price*.5,max=d.price*1.25;
 const ymax=Math.max(gross/min,original,(a.offer&&a.offer>0?gross/a.offer:0))*1.12;
 const x=(p:number)=>45+(p-min)/(max-min)*365,y=(n:number)=>185-n/ymax*155;
 const path=Array.from({length:50},(_,i)=>{const price=min+(max-min)*i/49;return `${i?'L':'M'}${x(price).toFixed(2)},${y(gross/price).toFixed(2)}`;}).join(' ');
 const current=a.offer&&a.offer>=min&&a.offer<=max?a.offer:null;
 return <svg className="issuance-chart" viewBox="0 0 440 235" role="img" aria-label="Modelled shares issued fall as offer price rises, holding scenario gross proceeds fixed."><text x={45} y={15}>New {d.ticker==='EBR'?'CDIs':'shares'} (millions)</text>{[0,1,2,3].map(i=>{const v=ymax*i/3;return <g key={i}><line x1={45} x2={410} y1={y(v)} y2={y(v)} stroke="#dfe5eb"/><text x={38} y={y(v)+4} textAnchor="end">{format(v,0)}</text></g>})}<path d={path} fill="none" stroke="#527da4" strokeWidth={2.5}/>{current!==null&&<><line x1={x(current)} x2={x(current)} y1={y(gross/current)} y2={185} stroke="#b57b29" strokeDasharray="3 3"/><circle cx={x(current)} cy={y(gross/current)} r={5} fill="#b57b29"/></>}{[min,d.price,max].map(p=><text key={p} x={x(p)} y={205} textAnchor="middle">{format(p,3)}</text>)}<text x={225} y={227} textAnchor="middle">Offer price (A$) · same gross proceeds</text></svg>;
}
const SPLIT_COLOURS=['#243d5a','#527da4','#8fb0cc','#ccd9e5'];
const STATUS={ahead:'Beat',met:'Met',behind:'Missed'} as const;
const pct=(v:number)=>`${v>=0?'+':'−'}${format(Math.abs(v),1)}%`;
const monthLabel=(iso:string)=>new Date(iso+'T00:00:00Z').toLocaleDateString('en-AU',{month:'short',year:'2-digit',timeZone:'UTC'});
function RaiseBrief({deal:d}:{deal:MorgansDeal}){
 const a=d.analysis,total=a.split?a.split.parts.reduce((t,p)=>t+p.amountM,0):0;
 return <section className="raise-brief">
  <div><h3>Use of funds</h3><ul className="points">{a.purpose.map(v=><li key={v}>{v}</li>)}</ul>
   {a.split&&<div className="split"><h4>{a.split.title}</h4><div className="split-bar" role="img" aria-label={a.split.parts.map(p=>`${p.label} A$${format(p.amountM,1)}m`).join(', ')}>{a.split.parts.map((p,i)=><span key={p.label} style={{width:`${p.amountM/total*100}%`,background:SPLIT_COLOURS[i%4]}}/>)}</div><ul>{a.split.parts.map((p,i)=><li key={p.label}><i style={{background:SPLIT_COLOURS[i%4]}}/>{p.label}<b>{format(p.amountM,1)}</b></li>)}</ul></div>}</div>
  <div><h3>How the offer worked</h3><ul className="points">{a.structure.map(v=><li key={v}>{v}</li>)}</ul></div>
  <div><h3>Why this structure</h3><ul className="points">{(a.rationale??[]).map(v=><li key={v}>{v}</li>)}</ul></div>
 </section>;
}
function priceSince(d:MorgansDeal,prices:PriceHistory){const stock=prices.series[d.ticker]??[],latest=stock[stock.length-1];return {stock,latest,pct:(latest[1]/d.price-1)*100};}
function nonParticipantDilution(d:MorgansDeal){const base=d.capital?.sharesPreM??d.analysis.quotedBaseM,issued=d.amountM/d.price;return base?{pct:issued/(base+issued)*100,quoted:!d.capital}:null;}
const RESULT={better:'Better off',mixed:'Mixed',worse:'Worse off'} as const;
function RaiseReview({deal:d,prices}:{deal:MorgansDeal;prices:PriceHistory}){
 const a=d.analysis,r=priceSince(d,prices),hit=a.metrics.filter(m=>m.status!=='behind').length,dil=nonParticipantDilution(d);
 const dates=[...new Set(a.metrics.flatMap(m=>m.date?[m.date]:[]))].sort();
 return <><section className="raise-review"><div className="section-heading"><h2>Outcome against stated targets</h2><span>Prices to {dateLabel(r.latest[0])}</span></div>
  <div className="review-stats">
   <div><span>Targets met</span><strong>{hit} of {a.metrics.length}</strong></div>
   <div><span>Share price vs offer price</span><strong className={r.pct>=0?'up':'down'}>{pct(r.pct)}</strong><small>A${format(d.price,3)} to A${format(r.latest[1],3)}</small></div>
   <div><span>Dilution for non-participating holders</span><strong>{dil?`${format(dil.pct,1)}%`:'–'}</strong>{dil?.quoted&&<small>Of quoted CDIs</small>}</div>
  </div>
  <div className="review-grid">
   <div className="review-scroll"><table className="review-table metric-table"><thead><tr><th>#</th><th>Measure</th><th>Stated at the raise</th><th>Outcome</th><th/><th>Share price on the day</th></tr></thead><tbody>{[...a.metrics].sort((x,y)=>(x.date??'9')<(y.date??'9')?-1:(x.date??'9')>(y.date??'9')?1:0).map(m=>{const mv=m.date?dayMove(r.stock,m.date):null;return <tr key={m.metric}><td className="num">{m.date?dates.indexOf(m.date)+1:''}</td><th>{m.metric}</th><td>{m.target}</td><td>{m.result}{m.source&&<a className="src" href={m.source.url} target="_blank" rel="noreferrer">{m.source.label}</a>}</td><td className={`status ${m.status}`}>{STATUS[m.status]}</td><td className={`move ${mv?(mv.pct>=0?'up':'down'):''}`}>{mv?<>{pct(mv.pct)}<small>{dateLabel(mv.date)}</small></>:'–'}</td></tr>;})}</tbody></table></div>
   <div><PriceChart deal={d} prices={prices} dates={dates}/>{a.priceNotes.length>0&&<ul className="points verdict">{a.priceNotes.map(v=><li key={v}>{v}</li>)}</ul>}</div>
  </div>
 </section>
 {a.assessment&&<Assessment deal={d}/>}</>;
}
function Assessment({deal:d}:{deal:MorgansDeal}){
 const s=d.analysis.assessment!;
 return <section className="assessment"><div className="section-heading"><h2>Assessment</h2></div>
  <div className="take">{s.take.map(v=><p key={v}>{v}</p>)}<p className="takeaway"><b>Key lesson</b>{s.takeaway}</p></div>
 </section>;
}
function Report({deals,prices,open}:{deals:MorgansDeal[];prices:PriceHistory;open:(id:string)=>void}){
 return <article className="report">
  <h2>Research into Morgans' corporate advisory work: three ASX equity raises</h2>
  <p className="report-meta">Michael Nguyen · Prices to {dateLabel(prices.checkedAt)} · Independent research, not affiliated with or endorsed by Morgans</p>
  <section className="exec"><h3>Executive summary</h3><p>This note reviews three ASX equity raises on which Morgans acted as lead manager, covering an institutional placement, an accelerated non-renounceable entitlement offer and a placement of CDIs by a US-domiciled company. For each raise it sets out the use of funds and the reasons for the chosen structure, tests the outcome against the targets the company stated at launch, and measures the share price against the offer price.</p><p>All three companies delivered most of what they said the capital was for, but only Wagners has delivered a positive return to investors who participated. The results suggest that the size of a raise relative to the milestone it has to fund matters more to investors than whether the stated targets are met.</p></section>
  <div className="review-scroll"><table className="review-table report-table"><thead><tr><th>Deal</th><th>Amount raised</th><th>Targets met</th><th>Share price vs offer</th><th>Assessment</th></tr></thead><tbody>{deals.map(d=>{const r=priceSince(d,prices),ms=d.analysis.metrics;return <tr key={d.id}><th><button className="formula-row" onClick={()=>open(d.id)}>{d.company.replace(/ Holding Company Limited| Limited|, Inc\./g,'')}</button><small>{d.structure}, {dateLabel(d.date)}</small></th><td>A${format(d.amountM,1)}m at A${format(d.price,2)}</td><td>{ms.filter(m=>m.status!=='behind').length} of {ms.length}</td><td className={r.pct>=0?'up':'down'}>{pct(r.pct)}</td><td>{d.analysis.assessment?.summary}</td></tr>;})}</tbody></table></div>
  <section><h3>Findings by transaction</h3><ul className="points">
   <li>Wagners: a modest placement priced close to market funded growth the company could already see, and the capital was deployed as stated.</li>
   <li>29Metals: the entitlement offer secured the company's funding, but the Xantho Extended restart it was sized around slipped by about eight months, and the share price fell 35% on the announcement.</li>
   <li>EBR: the company met every target it set, but investors who subscribed at A$1.00 are 73.5% behind after a follow-on raise at A$0.38 in June 2026.</li>
  </ul></section>
  <section><h3>Conclusion</h3><p>Meeting the stated targets did not guarantee a good outcome for investors. The more useful question when assessing a raise is what milestone the capital needs to carry the company to, and whether the raise is large enough to get there, as that determines whether investors face a further raise at a lower price.</p></section>
  <section><h3>Methodology</h3><p>Targets are taken from each company's launch announcement, and outcomes from the company's subsequent reports and filings, which are linked alongside each result. A target is marked as met where a later report shows it was achieved by the stated date. Share prices are daily closes from Yahoo Finance.</p></section>
  <section><h3>Limitations</h3><ul className="points">
   <li>The attribution of the 16 April 2026 fall in the 29Metals share price to the Xantho Extended deferral relies on market coverage published that day.</li>
   <li>Wagners did not set quantitative targets, so it is assessed against its stated uses of funds.</li>
   <li>EBR's dilution is calculated on quoted CDIs, as the full US share register could not be confirmed.</li>
  </ul></section>
 </article>;
}
function PriceChart({deal:d,prices,dates}:{deal:MorgansDeal;prices:PriceHistory;dates:string[]}){
 const {stock}=priceSince(d,prices),n=stock.length;
 const all=[...stock.map(v=>v[1]),d.price],lo=Math.min(...all)*.92,hi=Math.max(...all)*1.06,X=(i:number)=>45+i/(n-1)*380,Y=(v:number)=>200-(v-lo)/(hi-lo)*170;
 const path=stock.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v[1]).toFixed(1)}`).join('');
 const ticks=[0,1,2,3].map(i=>lo+(hi-lo)*i/3),dp=hi<.2?3:2;
 const months=stock.map(v=>v[0].slice(0,7)),step=Math.max(1,Math.ceil(new Set(months).size/5));
 const monthTicks=months.map((m,i)=>i&&m!==months[i-1]?i:-1).filter(i=>i>0).filter((_,k)=>k%step===0);
 return <figure className="price-figure"><svg className="price-chart" viewBox="0 0 440 232" role="img" aria-label={`${d.ticker} daily close from ${dateLabel(stock[0][0])} to ${dateLabel(stock[n-1][0])}, against the A$${d.price} offer price`}>
  {ticks.map(t=><g key={t}><line x1={45} x2={425} y1={Y(t)} y2={Y(t)} stroke="#dfe5eb"/><text x={38} y={Y(t)+4} textAnchor="end">{format(t,dp)}</text></g>)}
  {monthTicks.map(i=><text key={i} x={X(i)} y={218} textAnchor="middle">{monthLabel(stock[i][0])}</text>)}
  <line x1={45} x2={425} y1={Y(d.price)} y2={Y(d.price)} stroke="#b57b29" strokeWidth={1.3} strokeDasharray="5 4"/>
  <path d={path} fill="none" stroke="#315f86" strokeWidth={2}/>
  {dates.map((day,k)=>{const i=stock.findIndex(v=>v[0]>=day);if(i<0)return null;return <g key={day}><circle cx={X(i)} cy={Y(stock[i][1])} r={8} fill="#243d5a" stroke="#fff" strokeWidth={1.5}/><text x={X(i)} y={Y(stock[i][1])+3.5} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>{k+1}</text></g>;})}
 </svg><figcaption><span><i className="key stock"/>{d.ticker} daily close</span><span><i className="key offer"/>Offer price A${format(d.price,3)}</span><span>Markers correspond to the table</span></figcaption></figure>;
}

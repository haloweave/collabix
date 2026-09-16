"use client";
import { useState } from "react";
import { spaces, money } from "@/lib/spaces";

function localDate() {
 return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
}
function taken(date: string, seat: number) {
 return (Array.from(date).reduce((sum, c) => sum + c.charCodeAt(0), 0) + seat * 17) % 10 < 3;
}
export default function Booking({initialSpace}: {initialSpace?: string}) {
 const [key,setKey]=useState(spaces.find(s=>s.key===initialSpace)?.key ?? "hotdesk");
 const [step,setStep]=useState(0);
 const [date,setDate]=useState("");
 const [hour,setHour]=useState(8);
 const [duration,setDuration]=useState(8);
 const [seat,setSeat]=useState<number|null>(null);
 const [name,setName]=useState("");
 const [email,setEmail]=useState("");
 const space=spaces.find(s=>s.key===key)!;
 const subtotal=space.rate*duration, tax=Math.round(subtotal*.18);
 const steps=["Space","Date & time",...(space.desk?["Seat"]:[]),"Details","Done"];
 const label=steps[step];
 const canContinue=label==="Space" || (label==="Date & time" && date!=="" && date>=localDate() && hour+duration<=20) || (label==="Seat" && seat!==null);
 function next(){setStep(step+1);}
 function restart(){setStep(0);setDate("");setSeat(null);setName("");setEmail("");}
 return <section className="pad section-ivory"><div className="wrap">
 <ol className="booking-progress" aria-label="Booking progress">{steps.map((s,i)=><li key={s} aria-current={i===step?"step":undefined} className={i===step?"current":""}><span>{i+1}</span>{s}</li>)}</ol>
 <div className="booking-layout"><div className="booking-panel">
 <span className="eyebrow">Step {step+1} · {label}</span>
 {label==="Space" && <><h2>Choose your space.</h2><div className="booking-options">{spaces.map(s=><button className={`opt ${key===s.key?"sel":""}`} key={s.key} aria-pressed={key===s.key} onClick={()=>{setKey(s.key);setSeat(null);}}><span className="oinfo"><span className="on">{s.name}</span><span className="od">{s.description}</span></span><span className="oprice"><span className="amt">{money(s.rate)}</span><span className="per"> / hour</span></span></button>)}</div></>}
 {label==="Date & time" && <><h2>Make time for great work.</h2><div className="field"><label htmlFor="booking-date">Date · Bengaluru time</label><input id="booking-date" type="date" min={localDate()} value={date} onChange={e=>{setDate(e.target.value);setSeat(null);}}/></div><div className="field"><label htmlFor="booking-time">Start time</label><select id="booking-time" value={hour} onChange={e=>{setHour(Number(e.target.value));setSeat(null);}}>{Array.from({length:13-duration},(_,i)=>i+8).map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}</select></div><span className="filter-label">Duration</span><div className="dur-toggle">{[1,2,4,8].map(d=><button key={d} className={duration===d?"sel":""} aria-pressed={duration===d} onClick={()=>{setDuration(d);setHour(Math.min(hour,20-d));setSeat(null);}}>{d===8?"Full day":`${d} ${d===1?"hour":"hours"}`}</button>)}</div></>}
 {label==="Seat" && <><h2>Find your spot.</h2><p>One shared desk bank, with hot or dedicated desk pricing. Grey seats are unavailable in this sample plan.</p><div className="floor-plan"><div className="floor-room">Lounge & Café</div><div className="floor-pair"><div className="floor-room">Meeting</div><div className="floor-room">Boardroom</div></div><div className="floor-bank"><span>Open-plan desks</span><div className="floor-seats">{Array.from({length:12},(_,i)=>i+1).map(n=><button key={n} disabled={taken(date,n)} aria-label={`Seat D-${String(n).padStart(2,"0")}${taken(date,n)?", unavailable":""}`} aria-pressed={seat===n} className={seat===n?"selected":""} onClick={()=>setSeat(seat===n?null:n)}>{String(n).padStart(2,"0")}</button>)}</div></div><div className="floor-pair"><div className="floor-room">Breakout</div><div className="floor-room">Pantry & Focus</div></div><div className="floor-room">Collab & Lounge</div></div><p aria-live="polite">{seat?`Selected: D-${String(seat).padStart(2,"0")}`:"Select an available seat to continue."}</p></>}
 {label==="Details" && <><h2>Your workday, at a glance.</h2><p>This is a preview. Your details stay on this page and are cleared when you leave.</p><form onSubmit={e=>{e.preventDefault();if(name.trim().length>=2)next();}}><div className="field"><label htmlFor="booking-name">Full name</label><input id="booking-name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label htmlFor="booking-email">Email</label><input id="booking-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="step-actions"><button className="btn btn-outline" type="button" onClick={()=>setStep(step-1)}>← Back</button><button className="btn btn-gold" type="submit" disabled={name.trim().length<2}>Preview booking →</button></div></form></>}
 {label==="Done" && <div className="confirm"><h2>Your booking preview is ready.</h2><p>Thanks, {name}. No space has been reserved, no payment collected and no email sent.</p><div className="confirm-details"><p>{space.name}{space.desk?` · D-${String(seat).padStart(2,"0")}`:""}</p><p>{date} · {hour}:00–{hour+duration}:00 IST</p><p>{email}</p><p>Estimated total: {money(subtotal+tax)}</p></div><a className="btn btn-gold" href="mailto:connect@collabix.co.in">Enquire about this space →</a><button className="btn btn-outline" onClick={restart} style={{marginTop:"1rem"}}>Start again</button></div>}
 {label!=="Details"&&label!=="Done"&&<div className="step-actions"><button className="btn btn-outline" disabled={step===0} onClick={()=>setStep(step-1)}>← Back</button><button className="btn btn-gold" disabled={!canContinue} onClick={next}>Continue →</button></div>}
 </div><aside className="summary" aria-label="Booking summary"><div className="s-head"><span className="eyebrow">Your workday</span><h3>Booking summary</h3></div><div className="s-body">{[["Space",space.name],["Date",date||"Choose a date"],["Time",`${hour}:00–${hour+duration}:00 IST`],...(space.desk?[["Seat",seat?`D-${String(seat).padStart(2,"0")}`:"Choose a seat"]]:[]),["Subtotal",money(subtotal)],["Sample tax (18%)",money(tax)]].map(([k,v])=><div className="s-line" key={k}><span className="sk">{k}</span><span className="sv">{v}</span></div>)}</div><div className="s-total"><span className="tk">Estimate</span><span className="tv">{money(subtotal+tax)}</span></div><p className="summary-note">Preview only. Rates, tax and availability are illustrative and will be confirmed before launch.</p></aside></div></div></section>;
}

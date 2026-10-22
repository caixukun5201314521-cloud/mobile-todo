export const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  activity: '<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  book: '<path d="M12 5C8 2 3 3 2 4v16c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-2-7-1-10 1Zm0 0v16"/>',
  paper: '<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8z"/><path d="M14 2v6h6M8 12h8M8 16h8"/>',
  wallet: '<path d="M20 8V5a1 1 0 0 0-1-1H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V7"/><path d="M21 13h-5v4h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  spark: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4m-2-2h4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  strength: '<path d="m7 7 10 10M3 7l4-4M17 21l4-4M2 12 12 2M12 22 22 12"/>',
  trend: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>', arrowDown: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  leaf: '<path d="M20 3c-7 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-9 8-16Z"/><path d="M4 21 15 10"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
  cloud: '<path d="M6 18a5 5 0 1 1 0-10 7 7 0 0 1 13 1 4.5 4.5 0 0 1 0 9z"/>',
  link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
  bike: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5m4-12h4m-3 3 7 1m2 8L16 4h3"/>',
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  crest: '<path d="M12 3 5 5.4v5.4c0 4.9 2.9 8.3 7 10.2 4.1-1.9 7-5.3 7-10.2V5.4Z"/><path d="M8.3 8.4c.9.8 2.1.8 3 0M12.7 8.4c.9.8 2.1.8 3 0"/><path d="M8.5 12.2h7M8.5 14.6h7"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>'
};
export function icon(name) { return `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`; }
export function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function localDate(d=new Date()) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function localInput(d=new Date()) {return `${localDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export function dateLabel(value) {if(!value)return '日期待定'; const d=new Date(value.length===10?value+'T12:00:00':value); return Number.isNaN(d.getTime())?'日期待定':d.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});}
export function timeLabel(value) {return new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
export function minutesLabel(value) {const n=Number(value)||0;return n>=60?`${Math.floor(n/60)} 小时${n%60?` ${n%60} 分钟`:''}`:`${n} 分钟`;}
export function money(value) {return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:2,maximumFractionDigits:2}).format(value||0);}
export function safeUrl(value,image=false) {
  if(typeof value!=='string')return '';
  if(image&&/^\/uploads\/[^\s<>"'\\]+$/.test(value))return value;
  if(image&&/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value))return value;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
export function moduleOf(todo) {if(['life','learning','research','training'].includes(todo.module))return todo.module; if(['健康','健身','训练','运动'].includes(todo.category))return 'training';return 'life';}
export function dueDate(todo) {if(!todo.date)return null; const date=new Date(`${todo.date}T${todo.time||'23:59'}:00`);return Number.isNaN(date.getTime())?null:date;}
export function countdown(todo,now=new Date()) {
  const due=dueDate(todo);if(!due)return '未设置截止';
  const delta=due-now,minutes=Math.floor(Math.abs(delta)/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
  const label=days?`${days} 天 ${hours} 小时`:hours?`${hours} 小时 ${mins} 分`:minutes?`${minutes} 分钟`:'不到 1 分钟';
  return `${delta<0?'已逾期 ':''}${label}`;
}
export function sumMinutes(items) {return Math.round(items.reduce((total,item)=>total+(Number(item.durationMinutes)||0),0)*10)/10;}
export function financeSummary(transactions,budget,month) {
  const cents={income:0,expense:0,investment:0,necessary:0,discretionary:0};
  for(const t of transactions){if(!t.date?.startsWith(month))continue;const n=Math.round(Number(t.amount)*100);if(!Number.isFinite(n))continue;if(['income','expense','investment'].includes(t.type))cents[t.type]+=n;if(t.type==='expense')cents[t.necessary?'necessary':'discretionary']+=n;}
  const funds=Math.round(Number(budget)*100)+cents.income;
  return {...Object.fromEntries(Object.entries(cents).map(([k,v])=>[k,v/100])),funds:funds/100,available:(funds-cents.expense-cents.investment)/100};
}

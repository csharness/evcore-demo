import {validateReport} from './domain.js';
import {FINDING_STATUSES,CONFIDENCE,SAFETY_LEVELS,REPORT_NUMBER,sanitizeVehicleInfo,sanitizeWarranty,sanitizeInspection,sanitizeAudit} from './diagnosis-fields.js';
export {FINDING_STATUSES};
export const REPORT_LIMIT=5000,JOB_LIMIT=5000,CUSTOMER_LIMIT=5000,VEHICLE_LIMIT=10000,IMPORT_BYTES=20*1024*1024;
export const JOB_STATUSES=['Open','In progress','Complete'];
// Where a report came from. 'demo' (in-app simulation), 'simulator' (the real firmware running on
// this computer) and 'emulator' (the D1 emulator on a serial port, docs/d1-emulator.md) are all
// simulated data and are always labeled as such. Only 'usb' is a physical device.
export const SOURCES=['demo','simulator','usb','emulator'];
export const isSimulated=source=>source!=='usb';
// A device on the USB link that identifies as a simulator (board mvp-sim-*, serial SIM-*): the D1
// emulator. Studio labels its data as simulated; simulators are never licensed devices.
export const isSimulatedDevice=device=>/^SIM-/.test(String(device?.serial||''))||/^mvp-sim-/.test(String(device?.board||''));
const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const stamp=v=>Number.isFinite(v)&&v>0?v:null;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,32}$/.test(v)?v:'unknown';
// Version identifiers of the device that produced a report; null for records saved before they existed.
export function sanitizeDevice(d){
 if(!d||typeof d!=='object')return null;
 return {protocol:token(d.protocol),firmware:token(d.firmware),build:token(d.build),board:token(d.board),serial:token(d.serial),knowledge:token(d.knowledge),calibration:token(d.calibration)};
}
// Normalizes one stored session entry; returns null when it cannot be trusted as a record.
export function sanitizeEntry(x){
 if(!x||typeof x.id!=='string'||!x.id||typeof x.session!=='string'||!SOURCES.includes(x.source)||!validateReport(x.report))return null;
 const created=stamp(x.created);if(created===null)return null;
 return {id:x.id.slice(0,64),session:x.session.slice(0,80),notes:text(x.notes,2000),jobId:typeof x.jobId==='string'?x.jobId.slice(0,64):null,source:x.source,created,device:sanitizeDevice(x.device),report:x.report};
}
export function sanitizeJob(j){
 if(!j||typeof j.id!=='string'||!j.id||typeof j.title!=='string'||!j.title.trim()||typeof j.vehicle!=='string'||!j.vehicle.trim()||!JOB_STATUSES.includes(j.status))return null;
 return {id:j.id.slice(0,64),title:j.title.slice(0,80),vehicle:j.vehicle.slice(0,120),symptom:text(j.symptom,500),status:j.status,created:stamp(j.created)??0,
  vehicleId:ref(j.vehicleId),customerId:ref(j.customerId),notes:text(j.notes,4000),closed:stamp(j.closed)};
}
const ref=v=>typeof v==='string'&&v?v.slice(0,64):null;
// Customer and vehicle records (roadmap #89). Vehicle battery/motor/controller fields are free
// text as the technician found them; they are descriptive, never used as test limits.
export function sanitizeCustomer(c){
 if(!c||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||!c.name.trim())return null;
 return {id:c.id.slice(0,64),name:c.name.trim().slice(0,80),phone:text(c.phone,40),email:text(c.email,120),notes:text(c.notes,2000),created:stamp(c.created)??0};
}
export function sanitizeVehicle(v){
 if(!v||typeof v.id!=='string'||!v.id||typeof v.name!=='string'||!v.name.trim())return null;
 return {id:v.id.slice(0,64),customerId:ref(v.customerId),name:v.name.trim().slice(0,80),serial:text(v.serial,60),battery:text(v.battery,40),
  motor:text(v.motor,80),controller:text(v.controller,80),notes:text(v.notes,2000),created:stamp(v.created)??0};
}
// Manual diagnoses (decision 0006): what the technician observed and measured without EVCore
// hardware. Readings are compared only against a range the technician entered, with its source;
// Studio never supplies limits of its own. A finding is 'observed', 'suspected' or 'confirmed',
// a confirmed finding must say how it was confirmed, and 'ruled-out' records a cause checked and
// excluded (decision 0019).
export const DIAGNOSIS_LIMIT=5000,DIAGNOSIS_STATUSES=['Draft','Final'];
export const READING_UNITS=['V','mV','A','mA','Ω','kΩ','°C','%','Hz','rpm','bar','psi',''];
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
// Readings and findings carry an id so edits on two devices merge item by item (decision 0017).
// Items saved before ids existed get one from their position, the same on every device.
const ITEM_ID=/^[A-Za-z0-9-]{1,40}$/;
const itemId=(v,fallback)=>typeof v==='string'&&ITEM_ID.test(v)?v:fallback;
export const newItemId=()=>crypto.randomUUID();
function sanitizeReading(r,i=0){
 if(!r||typeof r!=='object'||!text(r.what,120).trim())return null;
 let min=num(r.min),max=num(r.max);
 if(min!==null&&max!==null&&min>max)[min,max]=[max,min];
 return {id:itemId(r.id,`r${i}`),what:text(r.what,120).trim(),where:text(r.where,120),value:num(r.value),unit:READING_UNITS.includes(r.unit)?r.unit:'',min,max,
  source:(min!==null||max!==null)?text(r.source,160):'',conditions:text(r.conditions,200),instrument:text(r.instrument,80),notes:text(r.notes,300),takenAt:stamp(r.takenAt)};
}
function sanitizeFinding(f,i=0){
 if(!f||typeof f!=='object'||!text(f.text,500).trim()||!FINDING_STATUSES.includes(f.status))return null;
 const how=text(f.how,300).trim();
 return {id:itemId(f.id,`f${i}`),text:text(f.text,500).trim(),status:f.status==='confirmed'&&!how?'suspected':f.status,how:f.status==='confirmed'?how:''};
}
// Whether a finding is confirmed, with how it was confirmed: what a diagnosis needs before it can be
// finalized. Before decision 0019 this alone made a report Final; now a person finalizes it.
export const hasConfirmedCause=findings=>(Array.isArray(findings)?findings:[]).some(f=>f&&f.status==='confirmed'&&String(f.text??'').trim()&&String(f.how??'').trim());
// A diagnosis is Final once someone finalized it and Draft until then (and again while reopened).
export const diagnosisStatus=d=>d&&d.finalizedAt?'Final':'Draft';
export function sanitizeDiagnosis(d){
 if(!d||typeof d.id!=='string'||!d.id)return null;
 const created=stamp(d.created);if(created===null)return null;
 const list=(v,fn,max)=>Array.isArray(v)?v.map(fn).filter(Boolean).slice(0,max):[];
 const out={id:d.id.slice(0,64),created,updated:stamp(d.updated)??created,jobId:ref(d.jobId),complaint:text(d.complaint,2000),
  symptoms:list(d.symptoms,s=>typeof s==='string'&&s.trim()?s.trim().slice(0,120):null,40),
  readings:list(d.readings,sanitizeReading,100),findings:list(d.findings,sanitizeFinding,50),
  recommendations:text(d.recommendations,4000),parts:text(d.parts,2000),technician:text(d.technician,80),
  vehicleInfo:sanitizeVehicleInfo(d.vehicleInfo),warranty:sanitizeWarranty(d.warranty),intakeCondition:text(d.intakeCondition,2000),
  inspection:sanitizeInspection(d.inspection),confidence:Object.hasOwn(CONFIDENCE,d.confidence)?d.confidence:'',evidence:text(d.evidence,2000),
  severity:Object.hasOwn(SAFETY_LEVELS,d.severity)?d.severity:'',verification:text(d.verification,2000),internalNotes:text(d.internalNotes,4000),
  reportNumber:REPORT_NUMBER.test(d.reportNumber??'')?d.reportNumber:'',revision:Number.isInteger(d.revision)&&d.revision>=0&&d.revision<1000?d.revision:0,
  finalizedAt:stamp(d.finalizedAt),finalizedBy:text(d.finalizedBy,80),audit:sanitizeAudit(d.audit)};
 // Saved before decision 0019: a diagnosis with a confirmed cause was Final, and its report said so.
 // It stays final as revision 1, so a report a customer already has is not turned back into a draft.
 if(!Object.hasOwn(d,'revision')&&hasConfirmedCause(out.findings))Object.assign(out,{finalizedAt:out.updated,finalizedBy:out.technician,revision:1});
 if(!out.finalizedAt)out.finalizedBy='';
 return {...out,status:diagnosisStatus(out)};
}
// A photo taken for a work order (decision 0014). The image files live in the photos folder beside
// the records, named by id; the record holds what Studio shows about the photo.
export const PHOTO_LIMIT=20000;
export const PHOTO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function sanitizePhoto(p){
 if(!p||typeof p.id!=='string'||!PHOTO_ID.test(p.id)||typeof p.jobId!=='string'||!p.jobId)return null;
 const created=stamp(p.created);if(created===null)return null;
 const size=v=>Number.isInteger(v)&&v>0&&v<=100000000?v:null;
 return {id:p.id,jobId:p.jobId.slice(0,64),created,width:size(p.width),height:size(p.height),bytes:size(p.bytes),caption:text(p.caption,200),inReport:p.inReport!==false,marks:sanitizeMarks(p.marks)};
}
// Marks on a photo (decision 0016): boxes with a short label, as fractions of the image size,
// drawn numbered on the report copy. `ai` records that the mark began as an AI suggestion the
// technician kept.
export const MARK_LIMIT=12;
export function sanitizeMarks(marks){
 const unit=v=>Number.isFinite(v)?Math.round(Math.min(1,Math.max(0,v))*10000)/10000:null;
 const out=[];
 for(const m of Array.isArray(marks)?marks:[]){
  const label=text(m?.label,80).trim(),x=unit(m?.x),y=unit(m?.y);
  if(!label||x===null||y===null)continue;
  const w=unit(Math.min(m?.w,1-x)),h=unit(Math.min(m?.h,1-y));
  if(w===null||h===null||w<0.01||h<0.01)continue;
  out.push({label,x,y,w,h,ai:m.ai===true});
  if(out.length===MARK_LIMIT)break;
 }
 return out;
}
// A reading is judged only against the technician's own range; without one there is no verdict.
export function readingVerdict(r){
 if(r.value===null||(r.min===null&&r.max===null))return 'none';
 return (r.min===null||r.value>=r.min)&&(r.max===null||r.value<=r.max)?'within':'outside';
}
function parse(textValue){
 if(typeof textValue!=='string'||textValue.length>IMPORT_BYTES)throw Error('The file is too large to be an EVCore Studio backup.');
 try{return JSON.parse(textValue);}catch{throw Error('The file is not valid JSON.');}
}
// Accepts a sessions archive ({schema_version:1,reports}) or a single exported session entry.
export function parseSessionImport(textValue){
 const data=parse(textValue);let list;
 if(data&&Array.isArray(data.reports)){if(data.schema_version!==1)throw Error('Unsupported session archive version.');list=data.reports;}
 else if(data&&data.report&&typeof data.id==='string')list=[data];
 else throw Error('This is not an EVCore Studio session archive or session file.');
 const entries=list.map(sanitizeEntry).filter(Boolean);
 return {entries,rejected:list.length-entries.length};
}
export function parseJobImport(textValue){
 const data=parse(textValue);
 if(!data||!Array.isArray(data.jobs))throw Error('This is not an EVCore Studio work-order backup.');
 if(data.schema_version!==1)throw Error('Unsupported work-order backup version.');
 const jobs=data.jobs.map(sanitizeJob).filter(Boolean);
 return {jobs,rejected:data.jobs.length-jobs.length};
}
// Reports already rotate oldest-first, so a merge keeps the newest records and reports which existing ones would be lost.
export function mergeReports(existing,incoming,limit=REPORT_LIMIT){
 const ids=new Set(existing.map(r=>r.id)),fresh=[];let duplicates=0;
 for(const r of incoming){if(ids.has(r.id)){duplicates++;continue;}ids.add(r.id);fresh.push(r);}
 const merged=[...existing,...fresh].sort((a,b)=>b.created-a.created),kept=merged.slice(0,limit),keptIds=new Set(kept.map(r=>r.id));
 return {reports:kept,added:fresh.filter(r=>keptIds.has(r.id)).length,duplicates,displaced:existing.filter(r=>!keptIds.has(r.id)).length,skipped:fresh.filter(r=>!keptIds.has(r.id)).length};
}
// Work orders are never evicted automatically; imports only fill remaining capacity and never overwrite an existing ID.
export function mergeJobs(existing,incoming,limit=JOB_LIMIT){
 const ids=new Set(existing.map(j=>j.id)),added=[];let duplicates=0,skipped=0;
 for(const j of incoming){if(ids.has(j.id)){duplicates++;continue;}if(existing.length+added.length>=limit){skipped++;continue;}ids.add(j.id);added.push(j);}
 return {jobs:[...existing,...added],added:added.length,duplicates,skipped};
}
export function importSummary(kind,{added,duplicates=0,skipped=0,displaced=0},rejected=0){
 const parts=[`Imported ${added} ${kind}${added===1?'':'s'}`];
 if(duplicates)parts.push(`${duplicates} already present`);
 if(rejected)parts.push(`${rejected} invalid and ignored`);
 if(skipped)parts.push(`${skipped} not imported (storage limit)`);
 if(displaced)parts.push(`${displaced} oldest local removed`);
 return parts.join(' · ')+'.';
}
export function pickFile(){
 return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',()=>{const file=input.files?.[0];if(!file)return resolve(null);if(file.size>IMPORT_BYTES)return reject(Error('The file is too large to be an EVCore Studio backup.'));file.text().then(resolve,reject);});
  input.addEventListener('cancel',()=>resolve(null));input.click();});
}

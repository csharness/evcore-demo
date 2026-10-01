import {validateReport} from './domain.js';
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
// and a confirmed finding must say how it was confirmed.
export const DIAGNOSIS_LIMIT=5000,FINDING_STATUSES=['observed','suspected','confirmed'],DIAGNOSIS_STATUSES=['Draft','Final'];
export const READING_UNITS=['V','mV','A','mA','Ω','kΩ','°C','%','Hz','rpm','bar','psi',''];
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function sanitizeReading(r){
 if(!r||typeof r!=='object'||!text(r.what,120).trim())return null;
 let min=num(r.min),max=num(r.max);
 if(min!==null&&max!==null&&min>max)[min,max]=[max,min];
 return {what:text(r.what,120).trim(),where:text(r.where,120),value:num(r.value),unit:READING_UNITS.includes(r.unit)?r.unit:'',min,max,
  source:(min!==null||max!==null)?text(r.source,160):''};
}
function sanitizeFinding(f){
 if(!f||typeof f!=='object'||!text(f.text,500).trim()||!FINDING_STATUSES.includes(f.status))return null;
 const how=text(f.how,300).trim();
 return {text:text(f.text,500).trim(),status:f.status==='confirmed'&&!how?'suspected':f.status,how:f.status==='confirmed'?how:''};
}
// A diagnostic report is Final once a finding is confirmed (with how it was confirmed) and a Draft
// until then. Derived, never chosen, so the report cannot say one thing while the findings say another.
export const diagnosisStatus=findings=>(Array.isArray(findings)?findings:[]).some(f=>f&&f.status==='confirmed'&&String(f.text??'').trim()&&String(f.how??'').trim())?'Final':'Draft';
export function sanitizeDiagnosis(d){
 if(!d||typeof d.id!=='string'||!d.id)return null;
 const created=stamp(d.created);if(created===null)return null;
 const list=(v,fn,max)=>Array.isArray(v)?v.map(fn).filter(Boolean).slice(0,max):[];
 const out={id:d.id.slice(0,64),created,updated:stamp(d.updated)??created,jobId:ref(d.jobId),complaint:text(d.complaint,2000),
  symptoms:list(d.symptoms,s=>typeof s==='string'&&s.trim()?s.trim().slice(0,120):null,40),
  readings:list(d.readings,sanitizeReading,100),findings:list(d.findings,sanitizeFinding,50),
  recommendations:text(d.recommendations,4000),parts:text(d.parts,2000),technician:text(d.technician,80)};
 return {...out,status:diagnosisStatus(out.findings)};
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

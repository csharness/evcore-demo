export const catalog = [
 {id:1,key:'sensor',name:'Analog sensor range',category:'Sensors',detail:'Check the signal against the selected limits.',unit:'V',min:0.5,max:4.5},
 {id:2,key:'motor',name:'Motor phase comparison',category:'Motor',detail:'Compare A–B, B–C and C–A resistance.',unit:'Ω',min:0.1,max:1},
 {id:3,key:'emf',name:'Passive back-EMF',category:'Motor',detail:'Compare three phase amplitudes under matched conditions.',unit:'V',min:1,max:10}
];
export const roadmap = [
 ['Battery capacity & load test','Requires a qualified load, current integration, and a validated battery profile.'],
 ['Controller & display protocols','Requires supported protocol decoders and approved harnesses.'],
 ['Live Hall / cadence / torque','Firmware acquisition and remote commands still required.'],
 ['Throttle / PWM simulation','Requires safe stimulus hardware and firmware permissions.'],
 ['Calibration & adapter management','Remote commands and persistent storage are still in development.']
];
export function phaseMismatch(values) {
 if (!Array.isArray(values)||values.length!==3||values.some(v=>!Number.isFinite(v)||v<0)) return null;
 const mean=values.reduce((a,b)=>a+b,0)/3;
 return mean>0 ? 100*(Math.max(...values)-Math.min(...values))/mean : null;
}
export function validateReport(r) {
 if(!r||r.schema_version!==1||!Number.isInteger(r.profile_id)||r.profile_id<=0||
   !['PASS','FAIL','UNKNOWN'].includes(r.result)||typeof r.reason!=='string'||r.reason.length>200||
   !Array.isArray(r.samples)||r.samples.length>3) return false;
 return r.samples.every(s=>s&&Number.isFinite(s.value)&&Number.isFinite(s.minimum)&&Number.isFinite(s.maximum)&&
   s.minimum<=s.maximum&&['V','A','ohm','Hz'].includes(s.unit)&&Number.isInteger(s.channel))&&validFaultRecords(r.fault_records)&&validCodes(r);
}
// Diagnostic codes (decision 0003): optional; when present, well-formed, and vehicle codes (M, S) only on FAIL.
function validCodes(r){
 const codes=r.diagnostic_codes;
 if(codes===undefined)return true;
 if(!Array.isArray(codes)||codes.length>6||!codes.every(c=>typeof c==='string'&&/^[MSE]-\d{3}$/.test(c)))return false;
 return r.result==='FAIL'||codes.every(c=>c.startsWith('E-'));
}
// Structured fault records (firmware evcore_fault.h). Optional for reports made before they existed;
// when present they must be well formed, or the whole report is rejected.
export const FAULT_CATEGORIES=['safety','instrument','internal','configuration','operator']; // priority order
function validFaultRecords(list){
 if(list===undefined)return true;
 return Array.isArray(list)&&list.length<=8&&list.every(f=>f&&Number.isInteger(f.code)&&typeof f.name==='string'&&/^[a-z_]{1,40}$/.test(f.name)&&
   FAULT_CATEGORIES.includes(f.category)&&['info','warning','error','critical'].includes(f.severity)&&
   ['inform','block','shutdown'].includes(f.action)&&typeof f.source==='string'&&Number.isInteger(f.time_ms)&&
   Number.isInteger(f.evidence)&&(f.value===null||Number.isFinite(f.value)));
}
// Why a test has no conclusion, most safety-relevant cause first. These describe the instrument, its
// interlocks, its configuration or the operator, never the device under test.
const noConclusion={
 safety:{title:'Safety interlock stopped the test',body:'A safety condition such as STOP, external voltage or an over-limit reading ended the test and turned outputs off. This says nothing about the component. Resolve the condition, reset the fault on the device, then retest.'},
 instrument:{title:'Instrument problem: no finding about the component',body:'EVCore’s own measurement, routing or output path reported a problem, so this test gives no information about the device under test. Check the adapter and connections, then retest. Do not replace parts on the basis of this result.'},
 internal:{title:'Internal instrument error',body:'The EVCore firmware detected an impossible internal state and shut outputs off. This says nothing about the component. Record the report and contact support if it repeats.'},
 configuration:{title:'Test setup rejected',body:'The device rejected the profile or adapter configuration before measuring. Check that the adapter and profile match, then retest.'},
 operator:{title:'Test cancelled',body:'The test was stopped before it finished, so there is no conclusion.'}
};
export function interpret(r) {
 if(!validateReport(r)) return {title:'Report unavailable',body:'The report format could not be validated.'};
 if(r.result==='UNKNOWN'){const categories=(r.fault_records??[]).map(f=>f.category);const cause=FAULT_CATEGORIES.find(c=>categories.includes(c));
  return cause?noConclusion[cause]:{title:'No diagnostic conclusion',body:'The test was interrupted or its data was unusable. Resolve the reported condition before starting a new test.'};}
 if(r.reason.includes('mismatch')) return {title:'Phase imbalance observed',body:'One phase-pair reading differs from the others. Inspect the harness and contacts, then repeat under the same conditions. This result alone does not establish an internal winding fault.'};
 if(r.result==='FAIL') return {title:'Outside the selected profile',body:'The recorded signal fell outside the chosen limits. Verify the adapter and profile before interpreting this as a component failure.'};
 return {title:'Selected checks passed',body:'These readings met this profile’s limits. This does not certify the entire component or vehicle.'};
}
export function csv(rows) {
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function parseFields(line) {
 const fields={};const matches=[...line.matchAll(/(?:^|\s)([a-z_]+)=/g)];
 for(let i=0;i<matches.length;i++) fields[matches[i][1]]=line.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??line.length).trim();
 return fields;
}

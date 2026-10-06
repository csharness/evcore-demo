import {catalog,phaseMismatch,parseFields,validateReport} from './domain.js';
// Mirrors firmware EV_DiagnoseReport for the demo fixtures (codes from knowledge/diagnostic-codes.json).
function demoCodes(profile,result,values,mismatch,faults){
 if(result==='UNKNOWN')return faults.map(f=>`E-${String(f.code).padStart(3,'0')}`);
 if(result!=='FAIL')return [];
 const p=catalog.find(x=>x.id===profile),codes=[];
 if(profile===2){if(mismatch>10)codes.push('M-201');if(values.some(v=>v>p.max))codes.push('M-202');if(values.some(v=>v<p.min))codes.push('M-203');}
 if(profile===3){if(mismatch>10)codes.push('M-301');if(values.some(v=>v<p.min))codes.push('M-302');if(values.some(v=>v>p.max))codes.push('M-303');}
 if(profile===1){if(values.some(v=>v>p.max))codes.push('S-101');if(values.some(v=>v<p.min))codes.push('S-102');}
 return codes;
}
export class DemoTransport {
 constructor(emit){this.emit=emit;this.mode='demo';this.connected=false;this.state='DISARMED';this.running=null;this.scenario='healthy';this.startTime=0;this.timer=null;this.lastReport=null;this.tick=0;}
 async connect(){this.connected=true;this.timer=setInterval(()=>this.step(),250);this.emit({type:'connection',mode:'demo',profiles:catalog,device:{protocol:'demo',firmware:'studio-simulator',build:'none',board:'simulated',knowledge:'none',calibration:'none'}});this.status();}
 status(){this.emit({type:'status',state:this.state,busy:!!this.running,outputs:this.state==='OUTPUT_ACTIVE'?(this.running?.id===2?12:9):0,faults:this.state==='FAULT'?1:0});}
 step(){if(!this.connected)return;this.tick++;const t=this.tick/4;
   this.emit({type:'telemetry',sample:{time:Date.now(),voltage:52.1+0.15*Math.sin(t/3),signal:this.scenario==='sensor-high'?4.85:2.4+1.2*Math.sin(t/2),current:this.running?0.1:0,temperature:26.5+0.3*Math.sin(t/6)},source:'simulation'});
   if(this.running&&Date.now()-this.startTime>=2200)this.complete();
   if(this.tick%3===0)this.emit({type:'frame',frame:{time:Date.now(),bus:'CAN',id:'0x180',data:[this.tick%256,0x24,0x08,0,0,0,0,0],source:'simulation'}});
 }
 async start(id){if(!this.connected||this.running||this.state==='FAULT')throw Error('Start denied. Resolve faults and reset first.');
   this.running=catalog.find(p=>p.id===Number(id));if(!this.running)throw Error('Unknown profile');this.startTime=Date.now();this.state=this.running.id===3?'DISARMED':'OUTPUT_ACTIVE';this.status();}
 complete(){const p=this.running;if(!p)return;let values=p.id===1?[this.scenario==='sensor-high'?4.85:2.45]:p.id===2?[0.25,0.26,this.scenario==='phase-imbalance'?0.49:0.25]:[3.01,3.04,3.02];
 const mismatch=p.id===1?null:phaseMismatch(values);const fail=values.some(v=>v<p.min||v>p.max)||(mismatch!==null&&mismatch>10);
 this.report(fail?'FAIL':'PASS',mismatch>10?'phase mismatch exceeds profile limit':fail?'outside profile limits':'within profile limits',values,mismatch);}
 report(result,reason,values=[],mismatch=null,faults=[]){const p=this.running;if(!p)return;
 this.lastReport={schema_version:1,profile_id:p.id,profile_revision:1,result,reason,started_ms:this.startTime,finished_ms:Date.now(),faults:this.state==='FAULT'?1:0,
 samples:values.map((value,i)=>({kind:p.id===1?0:p.id===2?2:4,channel:i,value,unit:p.id===2?'ohm':'V',minimum:p.min,maximum:p.max,time_ms:Date.now(),flags:0})),phase_comparison:p.id!==1,mismatch_percent:mismatch,mismatch_limit_percent:p.id===1?null:10,fault_records:faults,diagnostic_codes:demoCodes(p.id,result,values,mismatch,faults)};
 this.running=null;if(this.state!=='FAULT')this.state='DISARMED';this.status();this.emit({type:'report',report:this.lastReport});}
 // Simulated fault records use the firmware's codes and names (evcore_fault.c).
 fault(code,name,category,severity,action,source,evidence){return {code,name,category,severity,action,source,time_ms:Date.now()-this.startTime,evidence,value:null};}
 async stop(){if(this.running)this.report('UNKNOWN','cancelled',[],null,[this.fault(40,'cancelled','operator','info','inform','app',0)]);else{if(this.state!=='FAULT')this.state='DISARMED';this.status();}}
 async reset(){if(this.state!=='FAULT')throw Error('No latched fault to reset');this.state='DISARMED';this.status();}
 injectFault(){this.state='FAULT';if(this.running)this.report('UNKNOWN','safety interruption',[],null,[this.fault(1,'stop','safety','critical','shutdown','safety',1)]);else this.status();this.emit({type:'event',message:'Simulated E-stop: outputs OFF; fault latched.'});}
 async disconnect(){await this.stop();clearInterval(this.timer);this.connected=false;this.emit({type:'disconnected'});}
}

// Firmware protocol v2 client (tagged requests, see docs/host-protocol.md). The protocol is
// the same over every link; subclasses supply the link: Web Serial (USB) or the desktop
// app's firmware simulator bridge.
export const PROTOCOL_VERSION='2';
const MAX_REPLY_LINES=256,MAX_TAG=999999999;
// Independently versioned identifiers reported by INFO (knowledge base section 27).
export function deviceInfo(fields){const pick=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,32}$/.test(v)?v:'unknown';
 return {protocol:pick(fields.protocol_version),firmware:pick(fields.firmware),build:pick(fields.build),board:pick(fields.board),serial:pick(fields.serial),knowledge:pick(fields.knowledge),calibration:pick(fields.calibration)};}
// The device's own screen as reported by SCREEN (firmware evcore_ui). Null when the device has none.
export function parseScreen(lines){
 const head=/^screen=([a-z]+) tone=(neutral|ok|warn|alert) top=(\d+) total=(\d+) visible=(\d+)$/.exec(lines?.[0]??'');if(!head)return null;
 const screen={page:head[1],tone:head[2],top:Number(head[3]),total:Number(head[4]),visible:Number(head[5]),title:'',status:'',notice:'',hint:'',rows:[]};
 for(const line of lines.slice(1)){
  const row=/^row=(text|heading|item) selected=([01]) text=(.*)$/.exec(line);
  if(row){if(screen.rows.length<screen.visible)screen.rows.push({kind:row[1],selected:row[2]==='1',text:row[3]});continue;}
  const field=/^(title|status|notice|hint)=(.*)$/.exec(line);if(field)screen[field[1]]=field[2];
 }
 return screen;}
export class ProtocolClient {
 constructor(emit,mode){this.emit=emit;this.mode=mode;this.pending=new Map();this.tag=0;this.connected=false;this.profiles=[];this.reportKey='';this.device=null;}
 // Link hooks for subclasses.
 async openLink(){throw Error('No link');}
 async write(){throw Error('No link');}
 async closeLink(){}
 async connect(options){
  await this.openLink(options);this.connected=true;
  try{await this.handshake();this.emit({type:'connection',mode:this.mode,profiles:this.profiles,device:this.device});this.poll=setInterval(()=>this.pollStatus(),750);await this.pollStatus();}
  catch(e){await this.close(false);throw e;}
 }
 // Protocol discovery and profile list; both replies are END-terminated, so no timing guesswork.
 async handshake(){
  const info=parseFields((await this.request('INFO'))[0]??'');
  if(info.protocol_version!==PROTOCOL_VERSION||info.tags!=='1')throw Error(`Device protocol ${info.protocol_version||'unknown'} is not supported. Update the firmware to protocol ${PROTOCOL_VERSION}.`);
  this.device=deviceInfo(info);
  this.profiles=(await this.request('PROFILES')).filter(l=>l.startsWith('profile=')).map(parseFields).filter(p=>p.valid_for_adapter==='1')
   .map(p=>({id:Number(p.profile),name:(p.name||'').slice(0,44)||`Firmware profile ${p.profile}`,detail:`Revision ${p.revision} · adapter ${p.adapter} · ${p.steps} steps`,category:'Device'}));
 }
 // Sends "#<tag> command" and resolves with the reply body lines once "#<tag> END" arrives.
 request(command,timeout=2500){
  this.tag=this.tag>=MAX_TAG?1:this.tag+1;const tag=String(this.tag);
  return new Promise((resolve,reject)=>{const entry={lines:[],resolve,reject};
   entry.timer=setTimeout(()=>{this.pending.delete(tag);reject(Error('Device response timed out. Output state is unconfirmed.'));},timeout);
   this.pending.set(tag,entry);
   this.write(`#${tag} ${command}`).catch(e=>{clearTimeout(entry.timer);this.pending.delete(tag);reject(e);});});
 }
 handleLine(line){
  this.emit({type:'wire',line});
  const match=/^#(\d{1,9}) (.*)$/.exec(line);if(!match)return; // Untagged lines are diagnostic output only.
  const entry=this.pending.get(match[1]);if(!entry)return; // Late reply to a request that already timed out.
  if(match[2]==='END'){clearTimeout(entry.timer);this.pending.delete(match[1]);entry.resolve(entry.lines);return;}
  entry.lines.push(match[2]);
  if(entry.lines.length>MAX_REPLY_LINES){clearTimeout(entry.timer);this.pending.delete(match[1]);entry.reject(Error('Oversized device reply'));}
 }
 // The link closed without being asked to: physical output state is unknown.
 lost(message){
  if(!this.connected)return;
  this.connected=false;clearInterval(this.poll);this.rejectPending();
  if(message)this.emit({type:'error',message});
  this.emit({type:'disconnected',unexpected:true});
 }
 rejectPending(){for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(Error('Device disconnected; output state unconfirmed.'));}this.pending.clear();}
 async pollStatus(){if(this.polling||!this.connected)return;this.polling=true;try{const status=(await this.request('STATUS'))[0]??'';if(!status.startsWith('state='))throw Error('Unexpected device status reply');
   const s=parseFields(status);this.emit({type:'status',state:s.state,busy:s.busy==='1',outputs:Number(s.outputs),faults:Number(s.faults)});
   if(s.busy==='0'&&s.profile!=='0'&&s.reason!=='not complete'){const line=(await this.request('REPORT JSON'))[0]??'';if(line.startsWith('{')){const r=JSON.parse(line);if(!validateReport(r))throw Error('Invalid device report');if(line!==this.reportKey){this.reportKey=line;this.emit({type:'report',report:r});}}}
  }catch(e){if(this.connected){this.emit({type:'error',message:e.message});this.emit({type:'status',state:'UNCONFIRMED',busy:false,outputs:null,faults:null});}}finally{this.polling=false;}}
 // A command succeeds only on its exact acknowledgement; any other reply line is reported as the error.
 async action(cmd){const verb=cmd.split(' ')[0];const expected={START:'OK started',STOP:'OK stopped',RESET:'OK reset'}[verb];const reply=(await this.request(cmd))[0]??'';if(reply!==expected)throw Error(reply||`${verb} unconfirmed`);return reply;}
 async screen(){return parseScreen(await this.request('SCREEN'));}
 async start(id){await this.action(`START ${Number(id)}`);await this.pollStatus();}
 async stop(){await this.action('STOP');await this.pollStatus();}
 async reset(){await this.action('RESET');await this.pollStatus();}
 async close(stop=true){clearInterval(this.poll);if(stop&&this.connected)try{await this.action('STOP');}catch(e){this.emit({type:'error',message:e.message});}
  this.connected=false;this.rejectPending();try{await this.closeLink();}catch{}this.emit({type:'disconnected'});}
 async disconnect(){await this.close(true);}
}

// USB CDC through Web Serial. The desktop app shows its own port picker (desktop/main.cjs).
// Real USB enumeration/CDC descriptors are not implemented by the firmware yet.
export class SerialTransport extends ProtocolClient {
 constructor(emit){super(emit,'usb');this.buffer='';}
 async openLink(baudRate=115200){
  if(!navigator.serial)throw Error('USB serial is not available in this window.');
  this.port=await navigator.serial.requestPort();
  await this.port.open({baudRate});this.reader=this.port.readable.getReader();this.writer=this.port.writable.getWriter();
  this.readLoop();
 }
 async write(command){if(!this.connected||!this.writer)throw Error('Device disconnected');await this.writer.write(new TextEncoder().encode(command+'\n'));}
 async readLoop(){const decoder=new TextDecoder();try{while(true){const {value,done}=await this.reader.read();if(done)break;this.buffer+=decoder.decode(value,{stream:true});if(this.buffer.length>16384)throw Error('Oversized device response');let at;
  while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(at+1);this.handleLine(line);}
 }this.lost('USB connection closed.');}catch(e){this.lost(e.message);}}
 async closeLink(){try{await this.reader?.cancel();this.reader?.releaseLock();}catch{}try{this.writer?.releaseLock();await this.port?.close();}catch{}}
}

// The real firmware running as a host simulator inside the desktop app (desktop/firmware-sim.cjs).
// Its data is simulated and is labeled that way everywhere.
export class FirmwareSimTransport extends ProtocolClient {
 constructor(emit,bridge=globalThis.evcore?.firmware){super(emit,'simulator');this.bridge=bridge;}
 async openLink(){
  if(!this.bridge)throw Error('The firmware simulator is available in the desktop app only.');
  if(!await this.bridge.available())throw Error('The firmware simulator was not found. Build the firmware first (scripts/run-all.ps1).');
  this.offLine=this.bridge.onLine(line=>this.handleLine(line));
  this.offExit=this.bridge.onExit(()=>this.lost('The firmware simulator stopped.'));
  if(!await this.bridge.start())throw Error('The firmware simulator could not be started.');
 }
 async write(command){if(!this.connected)throw Error('Device disconnected');this.bridge.write(command);}
 async closeLink(){this.offLine?.();this.offExit?.();await this.bridge.stop();}
 // Simulator host controls: press and release the simulated E-stop.
 injectFault(){this.bridge.control('ESTOP');this.emit({type:'event',message:'Simulated E-stop pressed on the firmware simulator.'});setTimeout(()=>this.pollStatus(),50);}
 // The simulated front-panel knob. It is not a protocol command: a real device's knob is physical.
 knob(action){if(!['CW','CCW','PRESS','HOLD'].includes(action))throw Error('Unknown knob action');this.bridge.control(`KNOB ${action}`);setTimeout(()=>this.pollStatus(),60);}
 releaseStop(){this.bridge.control('RELEASE');this.emit({type:'event',message:'Simulated E-stop released. Reset the fault to continue.'});setTimeout(()=>this.pollStatus(),50);}
}

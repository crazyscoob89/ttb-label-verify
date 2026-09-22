'use client';
import type {StageMeasurement} from '../lib/live-photo-client';
const labels={upload:'Original photo upload',prepare:'Image validation & preparation',compare:'Joint comparison & snapshot'};
export default function OperationTimings({stages,local=false}:{stages:StageMeasurement[];local?:boolean}){
 if(!stages.length)return null;
 return <div className="operation-timings" aria-label="Measured operation stages" role="status">{stages.map(s=><span key={s.stage}>{labels[s.stage]}{s.stage==='prepare'&&local?' (includes local upload)':''}: {s.state==='running'?'in progress…':`${s.elapsedMs} ms · ${s.state}`}</span>)}<p className="help">Measured browser request stages, not a model-only benchmark. Joint comparison includes server validation, provider observations and snapshot persistence; separate provider time is not available. No estimated progress or automatic retry.</p></div>;
}

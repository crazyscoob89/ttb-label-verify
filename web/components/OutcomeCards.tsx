import type { Outcome } from '../lib/review-policy';
export const outcomeLabels:Record<Outcome,string> = {pass:'Pass',correction:'Request correction','second-review':'Second reviewer'};
export default function OutcomeCards({value,onChange,passReasons,disabled}:{value:Outcome|null;onChange:(value:Outcome)=>void;passReasons:string[];disabled:boolean}) {
  return <fieldset className="outcome-fieldset"><legend>Internal review outcome</legend><div className="outcome-cards">
    {(['pass','correction','second-review'] as const).map(key=>{
      const blocked=disabled || (key==='pass' && passReasons.length>0);
      return <label key={key} className={`outcome-card ${key} ${value===key?'selected':''} ${blocked?'locked':''}`}>
        <span className="outcome-top"><input type="radio" name="outcome" aria-label={outcomeLabels[key]} checked={value===key} disabled={blocked} onChange={()=>onChange(key)} /><span aria-hidden="true">{key==='pass'?'✓':key==='correction'?'≠':'!'}</span> {outcomeLabels[key]}</span>
        <strong className="outcome-state">{blocked?'BLOCKED':'AVAILABLE'}</strong>
        {key==='pass'?<span data-testid="pass-reasons">{passReasons.length?passReasons.join(' '):'All required checks resolved; human confirmation still required. Internal only, not legal approval.'}</span>:<span>{key==='correction'?'The label, application or image needs correction. Explain what must change.':'Escalate unresolved uncertainty. Record why; no person is assigned or notified.'}</span>}
      </label>;
    })}
  </div></fieldset>;
}

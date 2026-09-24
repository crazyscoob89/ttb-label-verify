import { useId } from 'react';
import type { Outcome } from '../lib/review-policy';
export const outcomeLabels:Record<Outcome,string> = {pass:'Pass',correction:'Request correction','second-review':'Second reviewer'};
export default function OutcomeCards({value,onChange,passReasons,disabled}:{value:Outcome|null;onChange:(value:Outcome)=>void;passReasons:string[];disabled:boolean}) {
  const name = useId();
  return <fieldset className="outcome-fieldset"><legend>Internal review outcome</legend><div className="outcome-cards">
    {(['pass','correction','second-review'] as const).map(key=>{
      const blocked=disabled || (key==='pass' && passReasons.length>0);
      return <label key={key} className={`outcome-card ${key} ${value===key?'selected':''} ${blocked?'locked':''}`}>
        <span className="outcome-top"><input type="radio" name={name} aria-label={outcomeLabels[key]} aria-describedby={`${name}-${key}-reason`} checked={value===key} disabled={blocked} onChange={()=>onChange(key)} /><span aria-hidden="true">{key==='pass'?'✓':key==='correction'?'≠':'!'}</span> {outcomeLabels[key]}</span>
        <strong className="outcome-state">{blocked?'BLOCKED':value===key?'SELECTED':'AVAILABLE'}</strong>
        {key==='pass'?<span id={`${name}-${key}-reason`} data-testid="pass-reasons">{passReasons.length?passReasons.join(' '):'All required checks resolved; human confirmation still required. Internal only, not legal approval.'}</span>:<span id={`${name}-${key}-reason`}>{disabled?'Blocked: complete, mapped comparison evidence is required.':key==='correction'?'The label, application or image needs correction. Explain what must change.':'Escalate unresolved uncertainty. Record why; no person is assigned or notified.'}</span>}
      </label>;
    })}
  </div></fieldset>;
}

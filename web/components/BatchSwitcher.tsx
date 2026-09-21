'use client';
import { useEffect, useRef } from 'react';
import type { BatchState } from '../lib/batch-state';

export default function BatchSwitcher({state,onNavigate,isSaved=()=>false}:{state:BatchState;onNavigate:(target:string)=>void;isSaved?:(pairId:string)=>boolean}) {
  const rail = useRef<HTMLDivElement>(null);
  const index = state.pairs.findIndex(pair=>pair.id===state.selectedId);
  useEffect(()=>{
    const current = rail.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (current && rail.current) {
      const card = current.getBoundingClientRect(); const container = rail.current.getBoundingClientRect();
      rail.current.scrollLeft += card.left - container.left - (container.width - card.width) / 2;
    }
  },[state.selectedId]);
  return <nav className="batch-nav" aria-label="Batch item switcher">
    <div className="batch-nav-head"><div><h2>Switch batch item</h2><p>Item {index+1} of {state.pairs.length} · Each label has its own review</p></div>
      <div className="actions"><button onClick={()=>onNavigate('previous')} disabled={index===0}>Previous item</button><button onClick={()=>onNavigate('next')} disabled={index===state.pairs.length-1}>Next item</button></div>
    </div>
    <div className="batch-rail" ref={rail}>{state.pairs.map(pair=><button className="batch-card" key={pair.id} aria-label={`Open ${pair.filename??pair.id}`} aria-current={pair.id===state.selectedId?'true':undefined} onClick={()=>onNavigate(pair.id)}>
      <strong>{pair.filename??'Invalid filename'}</strong><span>{pair.application?.applicationId??'Application blocked'} / {pair.application?.applicationVersion??'—'}</span><span>Revision {pair.revision} · {pair.processing}</span><span>{isSaved(pair.id)?'SAVED':pair.draft?'UNSAVED draft':'Not saved'}</span>
    </button>)}</div>
  </nav>;
}

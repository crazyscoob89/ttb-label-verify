'use client';
import { useState } from 'react';
import ComparisonWorkspace from './ComparisonWorkspace';
import BatchWorkspace from './BatchWorkspace';

export default function ReviewWorkspace({offlineEnabled}:{offlineEnabled:boolean}) {
  const [tab,setTab]=useState<'single'|'batch'>('single');
  return <>
    <nav className="tabs" role="tablist" aria-label="Review mode">{(['single','batch'] as const).map(id=><button key={id} id={`${id}-tab`} role="tab" aria-selected={tab===id} aria-controls={`${id}-panel`} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();const next=event.key==='Home'?'single':event.key==='End'?'batch':tab==='single'?'batch':'single';
      setTab(next);document.getElementById(`${next}-tab`)?.focus();
    }}>{id==='single'?'Single review':'Batch upload'}</button>)}</nav>
    {tab==='single'?<ComparisonWorkspace offlineEnabled={offlineEnabled}/>:<BatchWorkspace offlineEnabled={offlineEnabled}/>}
  </>;
}

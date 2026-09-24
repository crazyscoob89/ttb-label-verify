'use client';
import {useId,useRef,useState} from 'react';
import {checkFileDeclaration} from '../lib/contracts';
import {PHOTO_ROLES,type PhotoRole} from '../lib/live-photo-client';
export type LocalPhoto={photoId:string;file:File;role:PhotoRole;url:string};
/** URL ownership transfers to caller; caller releases retained URLs on unmount. */
export default function PhotoInput({photos,onChange}:{photos:LocalPhoto[];onChange:(photos:LocalPhoto[])=>void}){
 const input=useRef<HTMLInputElement>(null),[error,setError]=useState(''),[selected,setSelected]=useState('');
 const id=useId();
 const active=photos.find(p=>p.photoId===selected)??photos[0];
 function add(files:File[]){
  setError('');if(!files.length)return;
  if(photos.length+files.length>4){setError('One bottle accepts 1–4 photos. Remove a photo before adding more.');return;}
  const invalid=files.map(file=>{const issue=checkFileDeclaration(file);return issue?`${file.name}: ${issue}`:'';}).filter(Boolean);
  if(invalid.length){setError(invalid.join(' '));return;}
  if([...photos.map(p=>p.file),...files].reduce((sum,f)=>sum+f.size,0)>20*1024*1024){setError('The complete photo set exceeds 20 MiB of original files. Nothing was added.');return;}
  const next=files.map(file=>({photoId:crypto.randomUUID(),file,role:'other' as const,url:URL.createObjectURL(file)}));onChange([...photos,...next]);setSelected(next[0].photoId);
 }
 return <><label htmlFor={id}>Label image (JPEG or PNG)</label><input ref={input} id={id} type="file" multiple accept="image/jpeg,image/png" onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/>
 <button type="button" disabled={photos.length>=4} onClick={()=>input.current?.click()}>Add another photo</button><p className="help">{photos.length} / 4 photos · one bottle/application. Local previews only — not uploaded or analyzed.</p>
 <div className="photo-editor" role="group" aria-label="Selected bottle photos">{photos.map((p,index)=><div className="photo-editor-item" key={p.photoId}><button type="button" aria-pressed={active?.photoId===p.photoId} onClick={()=>setSelected(p.photoId)} aria-label={`Preview ${p.file.name}`}><img src={p.url} alt=""/><span>{index+1}. {p.file.name}</span></button><label>Role for {p.file.name}<select value={p.role} onChange={e=>onChange(photos.map(v=>v.photoId===p.photoId?{...v,role:e.target.value as PhotoRole}:v))}>{PHOTO_ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select></label><div className="actions"><button type="button" aria-label={`Move ${p.file.name} earlier`} disabled={index===0} onClick={()=>{const next=[...photos];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next);}}>Move earlier</button><button type="button" aria-label={`Remove ${p.file.name}`} onClick={()=>{onChange(photos.filter(v=>v.photoId!==p.photoId));URL.revokeObjectURL(p.url);}}>Remove</button></div></div>)}</div>
 {active&&<div className="intake-preview"><img src={active.url} alt="Selected label — not analyzed"/><p>{active.file.name} · {active.role} · Local preview only — not uploaded or analyzed.</p></div>}{error&&<p role="alert" className="notice error">{error}</p>}</>;
}

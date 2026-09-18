"""Versioned TTB continuation. Sources immutable. No inference unless --run.
Sequential, durable-before-dispatch ledger; no retries; frozen original payloads.
"""
import sys,json,hashlib,math,shutil,copy,importlib.util,datetime,os,fcntl,time,urllib.request,urllib.error,collections
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont
ROOT=Path(__file__).resolve().parent
BASE=Path('/opt/data/benchmarks/ttb-foundry-20260918-v1')
sys.path.insert(0,str(BASE))
import harness as H
Budget=H.Budget;payload=H.payload;MODELS=H.MODELS;OCR=H.OCR;S=H.S;R=H.R;E=H.E
CONDITIONS=['straight','angle','glare'];SEED=20260918
RATES={'gpt-4.1-mini':(.4,1.6),'gpt-5-mini':(.25,2),'grok-4-1-fast-non-reasoning':(.2,.5),'Mistral-Large-3':(.5,1.5),'Kimi-K2.6':(.95,4)}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text())
def save(p,d):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 tmp=p.with_suffix(p.suffix+'.tmp')
 with tmp.open('w') as f:json.dump(d,f,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
def source_manifest():return load(BASE/'bottles/manifest.json')
def field_outcome(correct,obscured,referral,valid):
 if not valid:return 'failure-referral'
 if referral:return 'safe-referral' if obscured else 'referral'
 if not correct:return 'dangerous-error'
 return 'unverifiable-correct-not-recovery' if obscured else 'visual-correct'
def render(f,condition):
 if condition not in CONDITIONS:raise ValueError(condition)
 im=Image.open(BASE/'bottles'/f['image']).convert('RGB');w,h=im.size
 meta={'seed':SEED,'randomness_used':False,'resolution':[w,h],'source_pixels_only':True,'condition':condition,'content_bounds':[0,0,w,h]}
 if condition=='angle':
  # Affine foreshortening cos(30deg), with camera roll shear; no crop of bottle/label.
  c=math.cos(math.radians(30));shear=.065
  im=im.transform((w,h),Image.Transform.AFFINE,(1/c,-shear/c,w/2-w/(2*c)+shear*h/(2*c),0,1,0),Image.Resampling.BICUBIC,fillcolor=(221,216,204))
  x0=c*370+shear*(135-h/2)+w/2*(1-c);x1=c*1830+shear*(3020-h/2)+w/2*(1-c)
  meta.update(content_bounds=[x0,135,x1,3020],angle_degrees=30,horizontal_scale=c,shear=shear,interpolation='bicubic',physical_rotation=False)
 if condition=='glare':
  # Blown central specular band: opaque core means characters are genuinely destroyed.
  # Blur is optical degradation only, never letter reconstruction.
  arr=np.asarray(im.filter(ImageFilter.GaussianBlur(.65)),dtype=np.float32)
  yy,xx=np.mgrid[:h,:w];dx=np.abs(xx-(1100+.018*(yy-2000)))
  alpha=np.clip((200-dx)/65,0,1)*np.clip((yy-1060)/55,0,1)*np.clip((2980-yy)/55,0,1)
  im=Image.fromarray(np.uint8(np.clip(arr*(1-alpha[:,:,None])+255*alpha[:,:,None],0,255)))
  meta.update(glare_core_halfwidth_px=135,glare_outer_halfwidth_px=200,glare_center_x=1100,glare_shear=.018,blur_sigma_px=.65,occlusion='central characters erased, all printed field lines cross band')
 return im,meta
def initial_visibility(f,condition,gt):
 out={}
 for field in S.FIELDS:
  absent=field!='government_warning' and gt['label_actual'].get('brand_as_rendered' if field=='brand_name' else field) is None
  obscured=condition=='glare' and not absent
  out[field]={'visibility':'absent' if absent else ('obscured' if obscured else 'visible'),'expect_referral_ok':bool(absent or obscured),'basis':'No printed value in source' if absent else ('Opaque central specular core removes characters' if obscured else 'Original raster retained; subject to independent native visual QA'),'annotator':'AVA pre-inference'}
 return out
def build_corpus():
 out=ROOT/'bottles';(out/'images').mkdir(parents=True,exist_ok=True);(out/'ground_truth').mkdir(exist_ok=True)
 rows=[]
 for f in source_manifest()['fixtures']:
  for condition in CONDITIONS:
   ident=f['fixture_id']+'__'+condition;im,meta=render(f,condition)
   dest=out/'images'/(ident+'.png');im.save(dest,compress_level=6)
   gtpath=out/'ground_truth'/Path(f['ground_truth']).name
   shutil.copyfile(BASE/'bottles'/f['ground_truth'],gtpath);gt=load(gtpath)
   rows.append(dict(id=ident,source_fixture=f['fixture_id'],condition=condition,image='images/'+dest.name,sha256=sha(dest),source_bottle=f['image'],source_bottle_sha256=f['derived_sha256'],source_label_sha256=f['source_sha256'],source_ground_truth=f['ground_truth'],ground_truth='ground_truth/'+gtpath.name,truth_sha256=sha(gtpath),transform=meta,visibility=initial_visibility(f,condition,gt)))
  print('RENDERED',f['fixture_id'],flush=True)
 save(out/'manifest.json',{'synthetic':True,'real_camera_validation':False,'seed':SEED,'renderer_sha256':sha(Path(__file__)),'source_manifest_sha256':sha(BASE/'bottles/manifest.json'),'visibility_status':'provisional-pending-native-QA','fixtures':rows})
 # Sheets are visual aids; native label crops preserve text for independent QA.
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
 for condition in CONDITIONS:
  fs=[f for f in rows if f['condition']==condition];sheet=Image.new('RGB',(1800,1980),'white');d=ImageDraw.Draw(sheet)
  for i,f in enumerate(fs):
   im=Image.open(out/f['image']);im.thumbnail((300,295));x=(i%6)*300;y=(i//6)*660
   # 600x900 crop scaled only for overview, not native readability adjudication.
   crop=Image.open(out/f['image']).crop((490,1180,1720,2770));crop.thumbnail((290,590))
   sheet.paste(crop,(x,y+35));d.text((x+4,y+4),f['source_fixture'],font=font,fill='black')
  sheet.save(out/(condition+'-sheet.jpg'),quality=95)
 return rows
def flat_queue():
 plan=load(BASE/'recovery-v2/resume-plan.json')
 # Run2 sequential GPT5 tail may contain any of last nine. Exclude ALL tail IDs,
 # even ones for which no output/dispatch was flushed. Never duplicate them.
 return [r for r in plan['minimal_cross_operator_unattempted'] if r['model']!='gpt-5-mini']
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--render',action='store_true');a=ap.parse_args()
 if a.render:build_corpus()

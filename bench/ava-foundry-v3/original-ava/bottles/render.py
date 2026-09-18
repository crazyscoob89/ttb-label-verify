"""Deterministic raster bottle mockups. No generated lettering; full source is mapped."""
import json,hashlib,shutil,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont
ROOT=Path(__file__).parent
SRC=Path('/opt/data/projects/ttb-label-verify-revision/fixtures')
W,H=2200,3200
SEED=20260918

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def font(n): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',n)
def render(f,index):
 commodity=f['commodity']; cx=1100; body=730 if commodity=='spirits' else 695
 # Smooth studio sweep and matte tabletop, no added product text.
 yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
 glow=np.exp(-(((xx-850)/1600)**2+((yy-1050)/2300)**2))
 bg=np.stack([175+60*glow,170+59*glow,157+61*glow],axis=2)
 table=yy>2990
 bg[table]*=(.94-.00006*(yy[table]-2990))[:,None]
 im=Image.fromarray(np.uint8(np.clip(bg,0,255)))
 sh=Image.new('RGBA',(W,H)); d=ImageDraw.Draw(sh); d.ellipse((320,2880,2010,3120),fill=(35,25,15,100)); sh=sh.filter(ImageFilter.GaussianBlur(48)); im=Image.alpha_composite(im.convert('RGBA'),sh)
 if commodity=='spirits':
  profile=[(170,180),(210,192),(540,192),(625,255),(740,540),(850,body),(2920,body),(2990,650),(3020,520)]
  color=np.array([112,126,113],dtype=np.float32)
 elif commodity=='wine':
  profile=[(170,150),(230,160),(620,160),(710,195),(800,315),(900,530),(1040,body),(2920,body),(2990,620),(3020,500)]
  color=np.array([42,67,37],dtype=np.float32)
 else:
  profile=[(170,160),(215,155),(540,155),(680,235),(800,405),(980,body),(2920,body),(2990,620),(3020,500)]
  color=np.array([110,64,26],dtype=np.float32)
 rad=np.interp(yy[:,0],[p[0] for p in profile],[p[1] for p in profile])[:,None]
 u=(xx-cx)/rad
 mask=(np.abs(u)<=1)&(yy>=170)&(yy<=3020)
 # Cylindrical diffuse plus narrow reflected softboxes, with dark glass rims.
 light=.32+.60*np.sqrt(np.clip(1-u*u,0,1))+.36*np.exp(-((u+.64)/.12)**2)+.22*np.exp(-((u-.80)/.065)**2)
 rgb=color[None,None,:]*light[:,:,None]+24*np.exp(-((u+.48)/.085)**2)[:,:,None]
 rgb+=12*np.exp(-((yy-2925)/45)**2)[:,:,None]
 rgba=np.concatenate([np.uint8(np.clip(rgb,0,255)),np.uint8(mask[:,:,None])*255],axis=2)
 bottle=Image.fromarray(rgba,'RGBA'); im=Image.alpha_composite(im,bottle)
 d=ImageDraw.Draw(im)
 # Neutral closure, deliberately no fake logo or lettering.
 capw=195 if commodity=='spirits' else 168
 d.rounded_rectangle((cx-capw,142,cx+capw,365 if commodity=='wine' else 290),radius=28,fill=(38,39,35),outline=(118,113,92),width=5)
 for x in range(cx-capw+15,cx+capw-10,13):
  c=int(55+35*(1-abs(x-cx)/capw)); d.line((x,160,x,350 if commodity=='wine' else 272),fill=(c,c,c-6),width=3)
 d.ellipse((cx-capw,135,cx+capw,180),fill=(77,77,67),outline=(140,134,110),width=4)
 # Full rectangular source mapped onto front cylinder using invertible mapping.
 # x=cx+600*sin(theta*u)/sin(theta), y=top+1800*v+sag*(1-u*u)+tilt*u+persp*u*(v-.5).
 theta=.56; half=600; top=1100; height=1800; sag=43; tilt=(-12,0,12)[index%3]; persp=18
 x0,x1=500,1700; y0,y1=1060,2970
 ly,lx=np.mgrid[y0:y1+1,x0:x1+1].astype(np.float32)
 uu=np.arcsin(np.clip((lx-cx)/half*math.sin(theta),-1,1))/theta
 vv=(ly-top-sag*(1-uu*uu)-tilt*uu+persp*uu*.5)/(height+persp*uu)
 valid=(np.abs(uu)<=1.000001)&(vv>=0)&(vv<=1)
 a=np.asarray(Image.open(SRC/f['image']).convert('RGB'),dtype=np.float32)
 sx=np.clip((uu+1)*.5*999,0,999); sy=np.clip(vv*1499,0,1499)
 ix=np.floor(sx).astype(int); iy=np.floor(sy).astype(int); fx=(sx-ix)[:,:,None]; fy=(sy-iy)[:,:,None]
 samples=(a[iy,ix]*(1-fx)+a[iy,np.minimum(ix+1,999)]*fx)*(1-fy)+(a[np.minimum(iy+1,1499),ix]*(1-fx)+a[np.minimum(iy+1,1499),np.minimum(ix+1,999)]*fx)*fy
 shade=(.985-.095*uu*uu-.022*uu)[:,:,None]
 samples=np.uint8(np.clip(samples*shade,0,255))
 label=Image.fromarray(np.concatenate([samples,np.uint8(valid[:,:,None])*255],axis=2),'RGBA')
 im.alpha_composite(label,(x0,y0))
 path=ROOT/'images'/f"{f['fixture_id']}.png"; im.convert('RGB').save(path,compress_level=6)
 # Bounds and analytic non-clipping checks sampled over the entire source perimeter.
 t=np.linspace(-1,1,1001); X=cx+half*np.sin(theta*t)/math.sin(theta)
 edges=np.concatenate([top+sag*(1-t*t)+tilt*t-persp*t*.5,top+height+sag*(1-t*t)+tilt*t+persp*t*.5])
 bounds=[float(X.min()),float(edges.min()),float(X.max()),float(edges.max())]
 assert bounds[0]>=x0 and bounds[2]<=x1 and bounds[1]>=y0 and bounds[3]<=y1
 assert bounds[0]>cx-body and bounds[2]<cx+body and bounds[3]<2990
 return {'source_box':[0,0,1000,1500],'cropped':False,'seed':SEED+index,'randomness_used':False,'mapping':'u=2*sx/999-1; v=sy/1499; x=cx+half*sin(theta*u)/sin(theta); y=top+height*v+sag*(1-u*u)+tilt*u+perspective*u*(v-0.5)','cx':cx,'half':half,'theta_radians':theta,'top':top,'height':height,'sag':sag,'tilt':tilt,'perspective':persp,'label_bounds':bounds,'minimum_horizontal_scale':2*half*theta*math.cos(theta)/math.sin(theta)/999,'interpolation':'bilinear, endpoint-inclusive','label_light':'RGB multiplied by 0.985-0.095*u*u-0.022*u','bottle_profile_y_radius':profile,'bottle_base_rgb':color.tolist(),'resolution':[W,H]}

def main():
 (ROOT/'images').mkdir(exist_ok=True); (ROOT/'ground_truth').mkdir(exist_ok=True)
 src=json.loads((SRC/'manifest.json').read_text())
 snapshots={str(p):sha(p) for p in [SRC/'manifest.json']+[SRC/f[k] for f in src['fixtures'] for k in ['image','ground_truth']]}
 m={'corpus':'TTB paired deterministic synthetic bottle mockups v1','synthetic':True,'photographs':False,'renderer':'render.py','renderer_sha256':sha(Path(__file__)),'seed':SEED,'source_root':str(SRC),'source_manifest_sha256':sha(SRC/'manifest.json'),'resolution':[W,H],'limitations':['Not photographs; stylized opaque shaded raster bottles, not physically based glass.','Full original label is mounted on front, including original whitespace and any preexisting degradations.','No new text, OCR, inference, external image assets or generative imaging.','Bilinear resampling and gentle multiplicative shading change pixel values, not intended wording.','Clean paired baseline: no new glare, blur, occlusion or severe perspective; cannot establish real-world photo accuracy.','A PNG preserves rendered pixels; JPEG contact sheet is preview only.'],'fixtures':[]}
 for i,f in enumerate(src['fixtures']):
  t=render(f,i); gt='ground_truth/'+Path(f['ground_truth']).name; shutil.copyfile(SRC/f['ground_truth'],ROOT/gt)
  m['fixtures'].append({'fixture_id':f['fixture_id'],'commodity':f['commodity'],'category':f['category'],'source_image':f['image'],'source_ground_truth':f['ground_truth'],'ground_truth':gt,'source_sha256':snapshots[str(SRC/f['image'])],'ground_truth_sha256':snapshots[str(SRC/f['ground_truth'])],'image':'images/'+f['fixture_id']+'.png','derived_sha256':sha(ROOT/'images'/f"{f['fixture_id']}.png"),'transform':t})
  print(f['fixture_id'],flush=True)
 assert all(sha(Path(p))==v for p,v in snapshots.items())
 m['immutable_source_verified']=True
 chosen=[0,1,2,3,5,8]
 sheet=Image.new('RGB',(1000,2300),(242,239,232)); d=ImageDraw.Draw(sheet)
 d.text((24,14),'SYNTHETIC BOTTLE MOCKUPS',font=font(35),fill=(40,40,35)); d.text((24,62),'Deterministic paired labels • not photographs',font=font(22),fill=(70,70,60))
 for k,i in enumerate(chosen):
  f=m['fixtures'][i]; thumb=Image.open(ROOT/f['image']); thumb.thumbnail((480,690),Image.Resampling.LANCZOS); x=10+(k%2)*500; y=110+(k//2)*725
  sheet.paste(thumb,(x+(480-thumb.width)//2,y)); d.text((x+10,y+692),f['fixture_id'],font=font(21),fill=(35,35,35))
 sheet.save(ROOT/'contact-sheet.jpg',quality=91,subsampling=0)
 m['contact_sheet']={'path':'contact-sheet.jpg','sha256':sha(ROOT/'contact-sheet.jpg'),'fixture_ids':[m['fixtures'][i]['fixture_id'] for i in chosen]}
 (ROOT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
 (ROOT/'source-hashes.json').write_text(json.dumps(snapshots,indent=2)+'\n')
if __name__=='__main__': main()

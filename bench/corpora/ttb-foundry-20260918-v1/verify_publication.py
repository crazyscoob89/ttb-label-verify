"""Offline publication integrity checks only. Never renders or invokes inference."""
import hashlib,json,re,subprocess
from pathlib import Path
P=Path(__file__).resolve().parent
REPO=P.parents[2]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(path,expected):
 p=REPO/path
 assert p.is_file(),path
 assert sha(p)==expected,path
 return p
inventory=load(P/'image-inventory.json')
entries=inventory['images']+load(P/'provenance-inventory.json')['files']
for row in entries:
 p=check(row['repository_path'],row['sha256'])
 assert p.stat().st_size==row['bytes'],str(p)
 blob=subprocess.check_output(['git','hash-object','--no-filters',str(p)],cwd=REPO,text=True).strip()
 assert blob==row['git_blob_sha1'],str(p)
 tracked=subprocess.check_output(['git','ls-files','--stage','--',row['repository_path']],cwd=REPO,text=True).split()
 assert tracked and tracked[1]==blob,('not tracked identically',row['repository_path'])
for row in load(P/'portable-fixtures.json')['fixtures']:
 for field in ['image','source_bottle','source_label','ground_truth']:
  if field in row:check(row[field],row[field+'_sha256'])
m=load(P/'bottles/manifest.json');v=load(P/'recovery-v3/bottles/manifest.json');freeze=load(P/'recovery-v3/visibility-freeze.json')
assert sha(REPO/'fixtures/manifest.json')==m['source_manifest_sha256']
assert sha(P/'bottles/render.py')==m['renderer_sha256']
assert sha(P/'bottles/manifest.json')==v['source_manifest_sha256']
assert sha(P/'recovery-v3/renderer-source.py.txt')==v['renderer_sha256']
assert sha(P/'recovery-v3/bottles/manifest.json')==freeze['manifest_sha256']
for f in m['fixtures']:
 assert sha(P/'bottles'/f['image'])==f['derived_sha256']
 assert sha(REPO/'fixtures'/f['source_image'])==f['source_sha256']
 assert sha(P/'bottles'/f['ground_truth'])==sha(REPO/'fixtures'/f['source_ground_truth'])==f['ground_truth_sha256']
for f in v['fixtures']:
 assert sha(P/'recovery-v3/bottles'/f['image'])==f['sha256']
 assert sha(P/'bottles'/f['source_bottle'])==f['source_bottle_sha256']
 assert sha(P/'recovery-v3/bottles'/f['ground_truth'])==sha(P/'bottles'/f['source_ground_truth'])==f['truth_sha256']
 assert sha(REPO/'fixtures/images'/(f['source_fixture']+'.png'))==f['source_label_sha256']
assert sha(P/'bottles'/m['contact_sheet']['path'])==m['contact_sheet']['sha256']
for original,expected in load(P/'bottles/source-hashes.json').items():
 assert sha(REPO/'fixtures'/original.split('/fixtures/',1)[1])==expected
links=re.findall(r'\[[^\]]*\]\(([^)]+)\)',(P/'README.md').read_text())
for link in links:
 if not link.startswith(('https:','http:','#')):assert (P/link.split('#')[0]).exists(),link
print(json.dumps({'status':'PASS','images_verified':len(inventory['images']),'provenance_files_verified':len(entries)-len(inventory['images']),'portable_fixture_links_verified':len(load(P/'portable-fixtures.json')['fixtures']),'readme_relative_links_verified':len(links),'manifest_hash_chains':'PASS','frozen_visibility_hash':'PASS','tracked_blob_identity':'PASS','scope':'publication integrity, not model testing or independent visual QA'},indent=2))

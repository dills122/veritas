from pathlib import Path
import os, subprocess, json, shlex, hashlib, time, shutil, gzip
ROOT=Path('/private/tmp/veritas-end-user-audit-fixed')
CLI=str(ROOT/'tools space/node_modules/.bin/veritas')
PACKAGE=ROOT/'tools space/node_modules/veritas'
ENV=dict(os.environ, PATH='/Users/dsteele/.nvm/versions/node/v24.18.0/bin:'+os.environ['PATH'])
records=[]
def run(label, args, expected=0, project=None, structured=False):
    argv=[CLI,*args,*(['--project',str(project)] if project else []),*(['--json'] if structured else [])]
    start=time.monotonic()
    p=subprocess.run(argv,cwd=ROOT,env=ENV,capture_output=True,text=True,timeout=45)
    r=dict(label=label,command=shlex.join(argv),cwd=str(ROOT),exit=p.returncode,stdout=p.stdout,stderr=p.stderr,seconds=round(time.monotonic()-start,3))
    records.append(r)
    with gzip.open(ROOT/'evidence/commands.jsonl.gz','wt') as f:
        for item in records: f.write(json.dumps(item)+'\n')
    assert p.returncode==expected,(label,p.returncode,p.stdout,p.stderr)
    print(label,p.returncode,len(p.stdout.splitlines()),flush=True)
    if structured:
        e=json.loads(p.stdout); assert e['schemaVersion']==1 and not p.stderr
        return e
    return r
def snap(project):
    return {str(p.relative_to(project)):(hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_mode&0o777) for p in project.rglob('*') if p.is_file() and '.veritas/runtime/' not in str(p.relative_to(project))}
def create(name,targets='codex,claude,kiro-ide'):
    p=ROOT/name; p.mkdir()
    result=run(name+' init',['init','--source','../company-library','--profile','company/baseline','--targets',targets],project=p)
    assert not (p/'AGENTS.md').exists()
    return p,result
def codes(e): return [d['code'] for d in e['diagnostics']]
shutil.copytree(PACKAGE/'examples/company-library',ROOT/'company-library')
assert run('version',['--version'])['stdout'].strip()=='0.1.0-rc.0'
helptext=run('root help',['--help'])['stdout']; assert all(s in helptext for s in ['Workflow','kiro-cli','--json','--project'])
for command in ['init','validate','plan','sync','check','update','recover']:
    h=run(command+' help',[command,'--help'])['stdout']; assert '--json' in h and '--project' in h
p,init=create('readme-project')
before=snap(p)
validate=run('README validate',['validate'],project=p)
plan=run('README plan',['plan'],project=p)
assert snap(p)==before
drift=run('initial drift',['check'],expected=1,project=p,structured=True)
assert drift['data']['operations'] and drift['data']['hasDrift']
sync=run('README sync',['sync'],project=p)
check=run('README check',['check'],project=p)
line_counts={k:len(v['stdout'].splitlines()) for k,v in dict(init=init,validate=validate,plan=plan,sync=sync,check=check).items()}
assert line_counts['check']==2 and line_counts['validate']==2
clean=snap(p)
for command in ['validate','plan','check']:
    full=run('full JSON '+command,[command],project=p,structured=True)
    assert full['data']
assert full['data']['operations'] and full['data']['manifest']
assert snap(p)==clean
# Supporting assets and executable intent survive through each native skill path.
for family in ['.agents','.claude','.kiro']:
    generated=p/family/'skills/review-repository'
    assert (generated/'assets/bytes.bin').read_bytes()==(PACKAGE/'examples/company-library/skills/review-repository/assets/bytes.bin').read_bytes()
    assert (generated/'scripts/inert.sh').stat().st_mode&0o111
# F1: exact packaged baseline-first adaptation recipe.
a,_=create('adapted','codex')
shutil.copyfile(PACKAGE/'examples/project/codex-adaptation.yaml',a/'veritas.yaml')
for command in ['validate','plan','sync','check']:
    e=run('adaptation '+command,[command],project=a,structured=True)
    assert 'ACTIVATION_ADAPTED' in codes(e)
assert (a/'AGENTS.md').exists()
# Human/JSON F2 refusals retain file paths and preserve the entire safe subset.
(p/'AGENTS.md').write_text((p/'AGENTS.md').read_text()+'\nUser edit.\n')
(ROOT/'company-library/skills/review-repository/assets/new.txt').write_text('New upstream supporting asset.\n')
user=snap(p); lock=(p/'veritas.lock.json').read_bytes()
u=run('human update',['update'],project=p)
assert 'Generated files are unchanged' in u['stdout'] and (p/'veritas.lock.json').read_bytes()!=lock
assert {k:v for k,v in snap(p).items() if k!='veritas.lock.json'}=={k:v for k,v in user.items() if k!='veritas.lock.json'}
conflicted=snap(p)
e=run('safe subset plan',['plan'],expected=3,project=p,structured=True)
assert any(op['kind']=='create' for op in e['data']['operations'])
e=run('edited refused JSON',['sync'],expected=3,project=p,structured=True)
assert 'OUTPUT_CONFLICT' in codes(e) and 'PLAN_CONFLICT' in codes(e)
assert any(d.get('source',{}).get('path')=='AGENTS.md' for d in e['diagnostics'])
assert any(op['kind']=='create' for op in e['data']['operations']) and snap(p)==conflicted
h=run('edited refused human',['sync'],expected=3,project=p)
assert 'OUTPUT_CONFLICT AGENTS.md' in h['stderr'] and 'Run veritas plan' in h['stderr'] and snap(p)==conflicted
# An unrelated identical unmanaged file also remains unmanaged.
n,_=create('unmanaged','codex'); (n/'AGENTS.md').write_bytes((a/'AGENTS.md').read_bytes())
unchanged=snap(n)
e=run('unmanaged refusal',['sync'],expected=3,project=n,structured=True)
assert 'OUTPUT_CONFLICT' in codes(e) and any(d.get('source',{}).get('path')=='AGENTS.md' for d in e['diagnostics']) and snap(n)==unchanged
# Corrupt manifest remains actionable, without any write.
(a/'.veritas/manifest.json').write_text('{bad manifest')
bad=snap(a)
e=run('corrupt manifest JSON',['sync'],expected=3,project=a,structured=True)
assert 'MANIFEST_INVALID' in codes(e) and any(d.get('source',{}).get('path')=='.veritas/manifest.json' for d in e['diagnostics']) and snap(a)==bad
h=run('corrupt manifest human',['sync'],expected=3,project=a)
assert 'MANIFEST_INVALID .veritas/manifest.json' in h['stderr'] and snap(a)==bad
# Manifest-only drift is visible when generated bytes remain identical.
m,_=create('manifest-only','codex'); run('manifest initial sync',['sync'],project=m)
(ROOT/'company-library/unselected.txt').write_text('Unselected snapshot change.\n')
run('manifest update',['update'],project=m)
e=run('manifest-only JSON',['check'],expected=1,project=m,structured=True)
assert e['data']['manifestChanged'] and all(op['kind']=='unchanged' for op in e['data']['operations'])
h=run('manifest-only human',['check'],expected=1,project=m)
assert 'Manifest update required' in h['stdout']
run('manifest-only sync',['sync'],project=m); run('manifest clean',['check'],project=m)
locked=(m/'veritas.lock.json').read_bytes(); cache=m/'.veritas/runtime/cache'/json.loads(locked)['source']['treeDigest']
shutil.rmtree(cache)
run('missing cache',['check'],expected=4,project=m,structured=True)
h=run('human cache restore',['update','--restore'],project=m)
assert 'unchanged' in h['stdout'] and (m/'veritas.lock.json').read_bytes()==locked
run('restored clean',['check'],project=m)
h=run('human recovery',['recover'],project=m); assert 'No interrupted transaction' in h['stdout']
# Other target routes are observed as generated artifacts, not harness certification.
for targets in ['claude','kiro-ide','kiro-cli','codex,claude,kiro-ide,kiro-cli']:
    t,_=create('target-'+targets.replace(',','-'),targets)
    run(targets+' sync',['sync'],project=t); run(targets+' check',['check'],project=t)
summary=dict(status='passed',archive=str(Path('/Users/dsteele/repos/veritas/artifacts/end-user-audit-fixes/veritas-0.1.0-rc.0.tgz')),commandCount=len(records),humanLineCounts=line_counts,checks=['packaged README workflow','packaged baseline-first adaptation','full JSON stdout and empty stderr','read-only project preservation','supporting asset bytes and executable intent','edited/unmanaged output preservation','safe subset not applied','corrupt manifest preservation','manifest-only drift visible','update outputs unchanged','cache restore lock unchanged','human recover summary','single target and combined generated routes'])
(ROOT/'evidence/acceptance.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary),flush=True)

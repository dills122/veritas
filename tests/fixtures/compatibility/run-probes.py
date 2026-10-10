import json, subprocess, hashlib, pathlib, os, sys, tempfile
B=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else tempfile.mkdtemp(prefix='veritas-compat-')); T=pathlib.Path(sys.argv[1]); N='/Users/dsteele/.nvm/versions/node/v24.18.0/bin/node'
B.mkdir(parents=True, exist_ok=True)
def put(p,s):
 p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(s if isinstance(s,bytes) else s.encode())
def inventory(p):
 return [{'path':str(f.relative_to(p)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'size':f.stat().st_size,'mode':oct(f.stat().st_mode&0o777)} for f in sorted(p.rglob('*')) if f.is_file() and not str(f.relative_to(p)).startswith(('.rulesync/','.ruler/','.git/'))]
def run(p,args):
 r=subprocess.run([N,*args],cwd=p,capture_output=True,text=True,timeout=30)
 return {'argv':[N,*args],'cwd':str(p),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
results={}
for tool in ['rulesync','ruler']:
 p=B/tool;p.mkdir(exist_ok=True)
 subprocess.run(['git','init','-q',str(p)],check=True)
 source=p/('.rulesync' if tool=='rulesync' else '.ruler')
 put(source/'skills/sample/SKILL.md','---\nname: sample\ndescription: Read fixture reference data.\n---\n\nRead [reference](references/note.md); preserve [bytes](assets/data.bin).\n')
 put(source/'skills/sample/references/note.md','# Reference\n\nFixture reference.\n')
 put(source/'skills/sample/assets/data.bin',bytes([0,255,10,13,128]))
 put(source/'skills/sample/scripts/do-not-execute.sh','#!/bin/sh\nprintf forbidden > SHOULD_NOT_EXIST\n')
 (source/'skills/sample/scripts/do-not-execute.sh').chmod(0o755)
 if tool=='rulesync':
  put(source/'rules/always.md','---\nroot: true\ntargets: ["*"]\ndescription: Shared baseline\nglobs: ["**/*"]\n---\n\n# Baseline\n\nAlways fixture instruction.\n')
  put(source/'rules/files.md','---\nroot: false\ntargets: ["*"]\ndescription: TypeScript guidance\nglobs: ["src/**/*.ts"]\nkiro:\n  inclusion: fileMatch\n  fileMatchPattern: "src/**/*.ts"\n---\n\n# TypeScript\n\nFile-scoped fixture instruction.\n')
  args=[str(T/'node_modules/rulesync/dist/cli/index.js'),'generate','--targets','codexcli,claudecode,kiro-ide','--features','rules,skills']
 else:
  put(source/'AGENTS.md','# Baseline\n\nAlways fixture instruction.\n')
  put(source/'files.md','---\npaths:\n  - "src/**/*.ts"\n---\n\n# TypeScript\n\nFile-scoped fixture instruction.\n')
  args=[str(T/'node_modules/@intellectronica/ruler/dist/cli/index.js'),'apply','--agents','codex,claude,kiro','--no-mcp','--no-gitignore','--local-only','--skills']
 # Preexisting shared/native instruction files; competitor may incorporate, backup, or replace.
 put(p/'AGENTS.md','# Unmanaged user baseline\nKEEP_USER_BASELINE\n')
 put(p/'CLAUDE.md','# Unmanaged Claude baseline\nKEEP_USER_CLAUDE\n')
 first=run(p,args); inv1=inventory(p)
 second=run(p,args); inv2=inventory(p)
 put(p/'CLAUDE.md',(p/'CLAUDE.md').read_bytes()+b'\nEDITED_BY_USER\n')
 third=run(p,args); inv3=inventory(p)
 results[tool]={'first':first,'firstInventory':inv1,'second':second,'secondInventory':inv2,'thirdAfterEdit':third,'thirdInventory':inv3,'repeatEqual':inv1==inv2,'userClaudeSurvives':'KEEP_USER_CLAUDE' in (p/'CLAUDE.md').read_text(),'editedClaudeSurvives':'EDITED_BY_USER' in (p/'CLAUDE.md').read_text(),'scriptExecuted':(p/'SHOULD_NOT_EXIST').exists()}
(B/'results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({k:{'exits':[v[x]['exit'] for x in ['first','second','thirdAfterEdit']],'repeatEqual':v['repeatEqual'],'userClaudeSurvives':v['userClaudeSurvives'],'editedClaudeSurvives':v['editedClaudeSurvives'],'scriptExecuted':v['scriptExecuted'],'stderr':v['first']['stderr'],'stdout':v['first']['stdout'],'files':[x['path'] for x in v['firstInventory']]} for k,v in results.items()},indent=2))

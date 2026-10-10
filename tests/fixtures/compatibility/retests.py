import json,pathlib,subprocess,shutil,hashlib,sys,tempfile
B=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else tempfile.mkdtemp(prefix='veritas-compat-')); T=pathlib.Path(sys.argv[1]); N='/Users/dsteele/.nvm/versions/node/v24.18.0/bin/node'
B.mkdir(parents=True, exist_ok=True)
def inv(p):
 return {str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file() and not str(f.relative_to(p)).startswith(('.ruler/','.rulesync/','.git/')) and not str(f).endswith('.bak')}
def run(p,args):
 r=subprocess.run([N,*args],cwd=p,capture_output=True,text=True,timeout=30)
 return {'argv':[N,*args],'cwd':str(p),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
out={}
for label,tool,targets in [('rulesync-codex-only','rulesync','codexcli'),('rulesync-reverse-order','rulesync','kiro-ide,claudecode,codexcli'),('ruler-empty','ruler',None)]:
 p=B/label;p.mkdir(exist_ok=True)
 s='.rulesync' if tool=='rulesync' else '.ruler';shutil.copytree(B/tool/s,p/s,dirs_exist_ok=True)
 args=[str(T/'node_modules/rulesync/dist/cli/index.js'),'generate','--targets',targets,'--features','rules,skills'] if tool=='rulesync' else [str(T/'node_modules/@intellectronica/ruler/dist/cli/index.js'),'apply','--agents','codex,claude,kiro','--no-mcp','--no-gitignore','--local-only','--skills']
 first=run(p,args);a=inv(p);second=run(p,args);b=inv(p)
 out[label]={'first':first,'second':second,'firstInventory':a,'secondInventory':b,'nonbackupRepeatEqual':a==b,'AGENTS':(p/'AGENTS.md').read_text()}
(B/'retests.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))

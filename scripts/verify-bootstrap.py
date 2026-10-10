"""Verify local AI Central integration without changing files or fetching sources."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

for relative in ('AGENTS.md', '.codex/steering/repository-steering.md',
                 '.codex/steering/testing-quality-gates-steering.md', '.serena/project.yml'):
    path = ROOT / relative
    if not path.is_file() or path.is_symlink():
        errors.append(f'{relative}: expected real project-owned file')
    elif '{{' in path.read_text():
        errors.append(f'{relative}: unresolved template placeholder')

links = []
for relative in ('.agents/skills', '.codex/skills', '.codex/steering'):
    base = ROOT / relative
    for path in sorted(base.iterdir()):
        if not path.is_symlink():
            continue
        links.append(path)
        if not path.exists():
            errors.append(f'{path.relative_to(ROOT)}: broken link')
        elif 'skills' in path.parts and not (path / 'SKILL.md').is_file():
            errors.append(f'{path.relative_to(ROOT)}: missing SKILL.md')
        result = subprocess.run(['git', 'check-ignore', '-q', str(path.relative_to(ROOT))], cwd=ROOT)
        if result.returncode != 0:
            errors.append(f'{path.relative_to(ROOT)}: machine-local link not excluded')

for relative in ('.codebase-memory/graph.db.zst', '.serena/memories/core.md'):
    if not (ROOT / relative).is_file():
        errors.append(f'{relative}: missing local tool artifact')
    if subprocess.run(['git', 'check-ignore', '-q', relative], cwd=ROOT).returncode != 0:
        errors.append(f'{relative}: expected local exclusion')

config = (ROOT / '.serena/project.yml').read_text()
if 'language_servers:\n- typescript' not in config:
    errors.append('Serena: TypeScript language server not configured')
if not (ROOT / '.agents/skills/codebase-memory/SKILL.md').is_file():
    errors.append('codebase-memory skill not installed')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f'Bootstrap verified: project guidance, Serena configuration, {len(links)} valid excluded links, local graph and memories.')

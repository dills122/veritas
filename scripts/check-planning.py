"""Check planning authority, requirement coverage, task graph and local navigation."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
ledger = json.loads((ROOT / 'docs/work-items.json').read_text())
items = ledger['items']
by_id = {task['id']: task for task in items}
requirements = set(re.findall(r'^\| (REQ-\d{3}) \|', (ROOT / 'docs/specification.md').read_text(), re.M))
decisions = set(re.findall(r'^\| (DEC-\d{3}) \|', (ROOT / 'docs/decisions.md').read_text(), re.M))
if len(by_id) != len(items):
    errors.append('Duplicate work item IDs')
if ledger.get('schemaVersion') != 1:
    errors.append('Unsupported ledger schema')
states = {'pending', 'in_progress', 'blocked', 'completed', 'deferred'}
covered = set()
for task in items:
    label = task['id']
    if task['status'] not in states or task['priority'] not in {'P0', 'P1', 'P2'}:
        errors.append(f'{label}: invalid status/priority')
    for field in ('scope', 'requirements', 'acceptance', 'verification', 'deliverable'):
        if not task.get(field):
            errors.append(f'{label}: missing {field}')
    for req in task['requirements']:
        covered.add(req)
        if req not in requirements:
            errors.append(f'{label}: unknown requirement {req}')
    for decision in task['decisions']:
        if decision not in decisions:
            errors.append(f'{label}: unknown decision {decision}')
    for dependency in task['depends_on']:
        if dependency not in by_id:
            errors.append(f'{label}: unknown dependency {dependency}')
        elif by_id[dependency]['wave'] > task['wave']:
            errors.append(f'{label}: dependency scheduled in a later wave')
    if task['status'] == 'completed' and not task['evidence']:
        errors.append(f'{label}: completed without evidence')
    for evidence in task['evidence']:
        path = (ROOT / evidence).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            errors.append(f'{label}: absent or unsafe evidence path {evidence}')
    if task['status'] == 'blocked' and not task['blockers']:
        errors.append(f'{label}: blocked without explanation')

visiting, visited = set(), set()
def visit(label):
    if label in visiting:
        errors.append(f'Dependency cycle at {label}')
        return
    if label in visited or label not in by_id:
        return
    visiting.add(label)
    for dependency in by_id[label]['depends_on']:
        visit(dependency)
    visiting.remove(label)
    visited.add(label)
for label in by_id:
    visit(label)
if requirements - covered:
    errors.append(f'Unscheduled requirements: {sorted(requirements - covered)}')

if not any('cycle' in error for error in errors):
    def ancestors(label):
        result = set()
        for dependency in by_id[label]['depends_on']:
            if dependency in by_id:
                result.add(dependency)
                result.update(ancestors(dependency))
        return result
    for position, first in enumerate(items):
        if first['status'] == 'completed':
            for dependency in first['depends_on']:
                if dependency in by_id and by_id[dependency]['status'] != 'completed':
                    errors.append(f"{first['id']}: completed with unfinished dependency {dependency}")
        for second in items[position + 1:]:
            if first['id'] in ancestors(second['id']) or second['id'] in ancestors(first['id']):
                continue
            for left in first['scope']:
                for right in second['scope']:
                    if left == right or (left.endswith('/') and right.startswith(left)) or (right.endswith('/') and left.startswith(right)):
                        errors.append(f"Parallel ownership overlap: {first['id']}, {second['id']}, {left}, {right}")

strategy = (ROOT / 'docs/test-strategy.md').read_text()
trace_rows = re.findall(r'^\| (REQ-\d{3}) \| ([^|]+) \|', strategy, re.M)
if {row[0] for row in trace_rows} != requirements:
    errors.append('Test-strategy requirement mapping differs from specification')
for req, references in trace_rows:
    for task_id in re.findall(r'TASK-\d{3}', references):
        if task_id not in by_id or req not in by_id[task_id]['requirements']:
            errors.append(f'{req}: inconsistent traceability to {task_id}')

rows = ['| Task | Priority | Wave | Dependencies | Delivery unit | Size | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |']
for task in items:
    rows.append('| ' + task['id'] + ' ' + task['title'] + ' | ' + task['priority'] + ' | ' +
                str(task['wave']) + ' | ' + (', '.join(task['depends_on']) or 'None') + ' | ' +
                task['delivery_unit'] + ' | ' + task['size'] + ' | ' + task['status'] + ' |')
expected = '\n'.join(rows)
plan_path = ROOT / 'docs/implementation-plan.md'
plan = plan_path.read_text()
start, end = '<!-- task-index:start -->', '<!-- task-index:end -->'
if '--render-index' in sys.argv:
    before, rest = plan.split(start, 1)
    _, after = rest.split(end, 1)
    plan = before + start + '\n' + expected + '\n' + end + after
    plan_path.write_text(plan)
actual = plan.split(start, 1)[1].split(end, 1)[0].strip()
if actual != expected:
    errors.append('Task index differs from ledger; run with --render-index')

paths = [ROOT / 'README.md', ROOT / 'AGENTS.md', *sorted((ROOT / 'docs').rglob('*.md'))]
for path in paths:
    text = path.read_text()
    # Navigation links only; code spans and future paths are not documentation links.
    for target in re.findall(r'(?<!!)\[[^\]]+\]\(([^)\n]+)\)', text):
        target = target.strip('<>')
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        destination = target.split('#', 1)[0]
        if destination and not (path.parent / destination).exists():
            errors.append(f'{path.relative_to(ROOT)}: broken local link {target}')
    for task_id in set(re.findall(r'\bTASK-\d{3}\b', text)):
        if task_id not in by_id:
            errors.append(f'{path.relative_to(ROOT)}: unknown task {task_id}')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f'Planning verified: {len(requirements)} requirements, {len(decisions)} decisions, '
      f'{len(items)} acyclic work items, ownership, traceability, task index and local links.')

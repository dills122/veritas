import type { Activation, TargetId } from '../../model/types.js';
export type CapabilityProfile = {
  id: string;
  target: TargetId;
  nativeActivation: readonly Activation['mode'][];
  skillRoot: string;
  evidence: 'documentation-based';
};
export const PROFILES: Readonly<Record<TargetId, CapabilityProfile>> = {
  codex: {
    id: 'codex-repo-v1',
    target: 'codex',
    nativeActivation: ['always'],
    skillRoot: '.agents/skills',
    evidence: 'documentation-based',
  },
  claude: {
    id: 'claude-repo-v1',
    target: 'claude',
    nativeActivation: ['always', 'files'],
    skillRoot: '.claude/skills',
    evidence: 'documentation-based',
  },
  'kiro-ide': {
    id: 'kiro-ide-repo-v1',
    target: 'kiro-ide',
    nativeActivation: ['always', 'files', 'manual', 'auto'],
    skillRoot: '.kiro/skills',
    evidence: 'documentation-based',
  },
  'kiro-cli': {
    id: 'kiro-cli-repo-v1',
    target: 'kiro-cli',
    nativeActivation: ['always', 'files', 'manual', 'auto'],
    skillRoot: '.kiro/skills',
    evidence: 'documentation-based',
  },
};

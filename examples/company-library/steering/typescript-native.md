---
id: typescript-native
description: Native conditional TypeScript guidance for Claude and Kiro.
activation:
  mode: files
  patterns: ['src/**/*.ts']
targets: [claude, kiro-ide, kiro-cli]
---

# TypeScript practices

Keep types strict, validate external data, and use explicit error contracts. Keep module initialization free of hidden effects.

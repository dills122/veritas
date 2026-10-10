# TASK-007 evidence

Claude pure adapter implemented in its owned src/adapters directory. Failing tests preceded implementation. Focused adapter suite passes 2 tests; combined adapter run passes 9. Focused adapter lint passes. Full typecheck is temporarily affected by parallel workers' test-first missing modules; integration gate will recheck when those land.

No filesystem/source access occurs in renderers. Complete skill assets preserve bytes, relative names and executable intent. The compiler chooses eligibility and shared baseline first; Codex renders that selected baseline with deterministic provenance. Claude imports shared AGENTS once and uses paths frontmatter for conditional native rules. Kiro emits native inclusion metadata including auto name/description and fileMatch arrays, with identical bytes for the two selected surface profiles. Shared bodies are excluded from native duplication.

The modes and frontmatter were checked against current vendor documentation, not a live harness. Kiro CLI profile requires V3 for full inclusion-mode behavior; legacy V1/V2 and custom-agent resource settings are outside this profile. Unsupported steering modes are errors. Advanced package controls remain parser errors in this RC. Combined-target safety and exact adaptation labels are verified by TASK-009.

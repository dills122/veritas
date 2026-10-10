# Veritas repository scope and priorities

Deliver v0.1 as one repository-local TypeScript CLI and reusable compiler core. The authoritative scope is in `docs/specification.md`, with executable contracts in `docs/technical-design.md`.

Priorities in order: protect existing content and scope; expose compatibility loss; reproduce pinned outputs; support review and CI drift checking; provide useful diagnostics and portable packaging.

Boundaries: model/config own schemas; sources own immutable snapshots and Git access; parsing/validation own declarative content; compiler owns target composition; adapters render pure artifacts; sync owns all managed writes and crash recovery; CLI owns user interaction and exit codes.

Do not let adapters fetch sources, access credentials, or write output files. Reject symlinked package entries, unsafe destination ancestors, traversal, case collisions, and unsupported target restrictions. Do not silently migrate existing AGENTS/CLAUDE files or the AI Central setup into Veritas ownership.

Delivery follows the work graph in `docs/implementation-plan.md`. The standalone compiler is the planning baseline; TASK-001 evaluates existing tools before broad implementation. If evidence favors reuse, revise the governing decision and dependent tasks before proceeding.

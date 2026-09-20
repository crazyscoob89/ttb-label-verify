# Technical deep dive

Start with the [brief project overview](../../README.md). This folder is the optional evaluator entry point; archived evidence is not a claim that the live application passed its release gates.

## Current implementation

- [Release status and completion gates](RELEASE-STATUS.md)
- [Approach, decisions and trade-offs](APPROACH.md)
- [Application setup and implementation notes](../../web/README.md)
- [Approved interface design](../ui/v3/README.md)
- [Comparison policy](../RULES-POLICY.md)
- [Provider boundary](../PROVIDER-BOUNDARY.md)

## Evaluation and evidence

- [Final model benchmark results](../../BENCHMARK-RESULTS.md)
- [Benchmark methodology](../BENCHMARK_PLAN.md)
- [Acceptance checklist](../ACCEPTANCE_CHECKLIST.md)
- [Review register and original evidence](../reviews/README.md)

## Architecture and additional engineering

- [Architecture/scope plan](../PLAN.md)
- [Threat model](../THREAT_MODEL.md)
- [Governance and audit design](../GOVERNANCE-AND-AUDIT-DESIGN.md)
- [Historical phased build plan](../BUILD-PLAN.md)
- [Historical implementation status](../IMPLEMENTATION-STATUS.md)
- [Preserved previous front page](HISTORICAL-OVERVIEW.md)

Identity, private storage, durable history, retention and Azure deployment feasibility are additional engineering work. Some have source-level tests or isolated evidence, but that does not establish an integrated deployed service. Follow the current release-status page for what actually works.

Existing source, benchmark records and hash-bound artifacts have not been renamed or removed merely to simplify navigation. Their stable paths preserve reproducibility and existing links.

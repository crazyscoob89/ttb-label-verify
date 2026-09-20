# TTB Label Verify

An AI-assisted alcohol-label review prototype: compare label artwork against an application record and surface matches, discrepancies and information that needs a human check. This is a review aid, not TTB/COLA approval or legal certification.

**Live demo:** deployment pending. The single-label upload/comparison flow is implemented and tested with simulated model responses; real-model and deployed acceptance remain open. See [release status](docs/deep-dive/RELEASE-STATUS.md).

## Review scope

Brand; class/type; alcohol content where applicable; net contents; producer/bottler name and address; country of origin for imports; and the government health warning, including wording and heading presentation. Applicability depends on beverage type. Unreadable or uncertain evidence must not be treated as a match.

## Run locally

Use Node.js 24.x with npm for the live-demo candidate:

```sh
npm --prefix web ci
npm --prefix web run dev
```

Open `http://localhost:3000/review`. Live inference is disabled until server-only credentials, a private spending ledger and demo access are configured. See [demo deployment instructions](web/DEMO-OPERATIONS.md); the [offline sample instructions](web/README.md) remain separate.

```sh
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
```

## Approach and limitations

- Next.js/React/TypeScript interface, validated image intake and deterministic comparison rules.
- Haiku vision via a server-side OpenRouter adapter is the selected extraction path; historical model benchmarks are not deployed-app accuracy or latency measurements.
- Single-label upload/comparison is wired; real-provider acceptance and a deployed URL remain open. The existing batch interface still uses offline samples.
- Difficult photographs and uncertain typography require human review. No physical print-size certification or COLA-system integration is claimed.
- Persistent identity/history and Azure network feasibility are separate engineering tracks, not working-demo claims.

## Explore further

[Technical deep dive](docs/deep-dive/README.md): architecture, model selection, test evidence, assumptions, trade-offs, security, governance and development history.

Application source and tests are in [`web/`](web/). Benchmark tooling/data and synthetic labels remain in `bench/` and `fixtures/`; their original paths are preserved for reproducibility.

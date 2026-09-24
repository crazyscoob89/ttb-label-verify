# TTB Label Verify

TTB Label Verify is an AI-assisted prototype for reviewing alcohol label images against an application record. It highlights matches, discrepancies and items that need human review before a label package is trusted.

**Live demo:** https://ttb-label-verify-lilac.vercel.app/review

## What it does

- Compares label evidence against application fields for brand, class/type, alcohol by volume, net contents, producer/bottler information, origin context and the government warning.
- Supports flat label images and photographed bottles, including multi-photo front/back/close-up review.
- Keeps the application data, label images, AI findings and human review decisions together in saved review history.
- Shows readable evidence and review outcomes instead of raw model JSON.

## Why it exists

Alcohol-label review is detail-heavy: small differences in alcohol percentage, class/type wording, origin statements or warning text can matter. This prototype gives a reviewer a faster first pass while still keeping the final decision with a human.

## Run locally

Use Node.js 24.x.

```sh
npm --prefix web ci
npm --prefix web run dev
```

Open `http://localhost:3000/review`.

Useful checks:

```sh
npm --prefix web test -- --testTimeout=60000
npm --prefix web run typecheck
npm --prefix web run build
```

## Current scope and limits

- This is a review aid, not TTB/COLA approval, legal certification or a replacement for human review.
- Physical print size cannot be verified from photos alone.
- Diagnostic saves are evidence of the prototype review flow, not regulatory approval.
- Flat label images should be faster because they are controlled inputs. Bottle photos can take longer because the app must interpret imperfect camera views.
- Puerto Rico/domestic-origin handling is treated explicitly: domestic-origin context can make imported-country comparison not applicable, while readable contradictory country claims are still surfaced.

## Project structure

- `web/` — Next.js app, comparison logic and tests.
- `bench/` — benchmark tooling and historical model-evaluation artifacts.
- `fixtures/` — synthetic and source-covered test fixtures.
- `docs/deep-dive/` — technical approach, acceptance evidence, policy notes, historical plans and detailed review records.

Start with the [technical deep dive](docs/deep-dive/README.md) if you want the implementation details and evidence trail.

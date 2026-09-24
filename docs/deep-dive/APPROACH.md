# Approach, assumptions and trade-offs

## Product boundary

The assignment is a standalone prototype comparing applicant-declared details against the corresponding alcohol-label image. The deliverables are a runnable source repository and an accessible deployed application. A simple working core takes priority over incomplete production infrastructure.

The stakeholder interviews add simple single/batch review, approximately five-second results, exact warning wording and heading presentation, and deployment-network concerns. Approximately five seconds is an end-to-end target, not a measured claim for the current app. Difficult-photo recovery is not a guaranteed prototype capability.

## Existing technical choices

- **Next.js, React and TypeScript:** reuse the implemented review interface and typed contracts rather than rebuild the design.
- **Sharp plus bounded intake validation:** validate file signatures, format, decoded dimensions and sanitized image bytes before inference.
- **Haiku vision through OpenRouter:** extract observations from the image without supplying applicant values as desired answers. The model does not issue the compliance verdict.
- **Deterministic comparison policy:** application details and observed evidence are compared by tested rules; uncertainty stays visible.
- **Explicit provider/spend boundary:** credentials remain server-side; live dispatch requires an authorized, bounded execution path. A client flag cannot authorize inference.

## Deliberate separation

A fixture demonstration is not live extraction. Historical benchmark results are not end-to-end application acceptance. Source-tested identity/storage libraries are not an integrated service. An Azure catalog listing or API call does not demonstrate restrictive-network compatibility.

The governance design and associated security evidence remain available for deeper review, but are not prerequisites invented by the assignment. Existing protection requirements must not be silently disabled when connecting the live prototype.

## Data and output assumptions

Each label belongs to an explicit application record. Inputs must not be paired by arbitrary upload order. Beverage type and imported/domestic status drive applicability; the model must not silently invent missing facts. Government-warning text is observed from the image rather than reconstructed from memory.

A successful scan is a review aid, not regulatory approval. Low-quality images, unknown typography and physical print-size assessment remain visible human-review limitations. The application must distinguish validation errors, provider failures and uncertain extraction from substantive discrepancies.

## Deployment

The current submission package uses the deployed Vercel demo linked from the repository front page, with Supabase-backed saved review history and server-side provider credentials. The release status records the reviewed source SHA, independent gate results and remaining human approvals for merge/promotion.

Observed timing is reported as prototype evidence, not a guaranteed service-level agreement. Flat label images are expected to be faster than imperfect bottle photos. Azure/Government-cloud feasibility remains a separate validation track; this submission does not claim restricted-network compatibility in advance.

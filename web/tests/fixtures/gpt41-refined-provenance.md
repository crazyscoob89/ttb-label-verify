# Captured refined GPT-4.1 replay provenance

These are response-only captures from the separately authorized successful refined front/back benchmark. No calls are made by these fixtures or tests. The original `gpt41-benchmark-*` fixtures are retained unchanged.

Source export: `/opt/data/ttb-gpt41-refined-evidence/` (audit provenance only; tests do not import or read that external directory).

| Repository fixture | Source export | SHA-256 |
| --- | --- | --- |
| `gpt41-refined-prompt.txt` | `prompt.txt` | `d4b16230c52d3c786560ac7e503d1e9bdb7b0436b36bf51581a6b173ba39cee3` |
| `gpt41-refined-schema.json` | `schema.json` | `81a66789c80e6197cb7e0fc8f4c5d3c4489ae917092547dadde1a81396f938af` |
| `gpt41-refined-envelope-0.json` | `slot-0-raw-response.txt` | `01f0828b0b0847f723c03a08d0c800c01ee8104ecdefacb5ba7b99b0a938dd80` |
| `gpt41-refined-envelope-1.json` | `slot-1-raw-response.txt` | `267b0b284ab74af5b54aae71fcadb3435cde5c56928dba0f1342e91c017a694e` |

All four files are byte-identical to the source exports. The model content inside each envelope is also byte-identical to the respective exported `slot-N-model-content.txt`. Prompt has no final newline; schema serialization is `JSON.stringify(schema, null, 2) + '\n'`. Production-generated request JSON was compared offline against both original captured requests with their exact image bytes, and matched completely. Those requests and image bytes are not committed.

`gpt41-refined-replay.test.ts` runs the actual production wire/envelope parsers and finalizer, validates the browser client, and saves/reopens through real disposable SQLite ReviewStore APIs. `gpt41-runtime.test.ts` replays the responses through the actual managed app route using a completely mocked network. Both retain source strings exactly and assert seven sourced field matches with physical print size unverified. Tiny generated media exercise persistence/bindings only; they are not presented as the images that produced these captured answers.

Application inputs use the pre-existing incident declaration fixture; commodity/import status there are explicitly documented test assumptions. New comparison revision 7 admits optional periods in the whole ABV suffix only, while retaining original AI evidence and all producer, warning, mismatch and aggregation constraints. Historical comparison revision 6 is not upgraded. The prior original benchmark is saved alongside the refined replay and reopened unchanged.

The provider-selected producer role excerpt is retained exactly in observation reasons, including its limitations; this is not independent manufacturing-role or legal certification. The parser's existing support guard is unchanged.

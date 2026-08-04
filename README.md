# Neverlost Case Navigator

Tranche 1 is a deterministic, synthetic-only application core for the public Build for Good case navigator concept.

The project uses a strict `CaseNavigatorService` boundary with an in-memory implementation. It contains no real records, network calls, live AI calls, authentication, database, migrations, deployment, or PDF generation.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

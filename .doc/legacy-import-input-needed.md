# Phase 5A — Source located

The initial missing-source blocker was resolved on 2026-09-11 when the user identified the legacy repository at `../../Node/MongoDB/activus`.

The relevant models, export/import code, services and views were inspected along with the original arrays (181 activities, 10 kinds). The user subsequently supplied raw exports in this repository at `data/activities.ndjson` and `data/kinds.ndjson`. These contain **218 activities and 10 kinds**, all with valid unique MongoDB IDs. They are now the authoritative mapping input.

Continue with:

- [Legacy import mapping and unresolved decisions](legacy-import-mapping.md)
- [Legacy export format and input options](legacy-export-format.md)
- [Legacy analysis and verification](legacy-import-analysis.md)

The missing-original-ID blocker is resolved; no additional export is needed for this dataset. The user confirmed all 218 activities belong to them, including the 48 without an owner field, and confirmed the 72 midnight records are date-only (preserve date, null start). The mapping lists the remaining decisions about dates, variants, stored zeros, precision, units and reference presentation. The former immutable-array fallback is retired. No live export was executed by the assistant and no source/database write occurred.

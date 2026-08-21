"""Offline analysis/algorithm scripts for the Katalyst platform.

The live app (Next.js + the @katalyst/* TS packages) owns everything on the
request path. This package owns work that is naturally batch/analytical:

- katalyst_analysis.matching        — §15.3 complementary-skill squad matching
- katalyst_analysis.eval_harness    — §9 AI Judge golden-set agreement scoring
- katalyst_analysis.squad_effectiveness — §15.6 squad net-positive metric

Every module reads/writes plain JSON using the same field names as the
Postgres schema / TS shared-types (§2), so the Node side can shell out to
these scripts (or a future queue worker can invoke them) without a schema
translation layer.
"""

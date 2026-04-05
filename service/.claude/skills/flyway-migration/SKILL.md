---
description: Writes safe, backward-compatible Flyway migrations for this service's PostgreSQL schema. Use this whenever the user wants to change the database — add or drop a column or table, add an index, rename something, backfill data, or change a constraint — and whenever they mention Flyway, migrations, or DDL. Use it even for changes that look trivial, because the locking behaviour of "trivial" DDL on a live Postgres table is the whole problem.
argument-hint: <what the schema change should do>
---

# Flyway migration

Two things make a migration dangerous: it locks a table for longer than the
request timeout, or it breaks the version of the app that is still running
during the rollout. Everything below is aimed at those two.

## Current state

Look at what's already applied before writing:

!`ls -1 src/main/resources/db/migration/ 2>/dev/null | tail -20`

Follow the naming and numbering you see there. Never edit an already-applied
migration — Flyway checksums them and the next startup will fail on a checksum
mismatch. Fix forward with a new version instead.

## Rolling-deploy safety

During a rollout, old and new pods run against the same schema at the same time.
So a migration must work with the code that's already deployed, not just the code
in your branch. That rules out doing a rename or a type change in one step.

**Expand / contract** is the pattern:

1. Deploy the additive change (new nullable column, new table, new index).
2. Deploy code that writes to both old and new, reads new with a fallback.
3. Backfill.
4. Deploy code that only uses the new shape.
5. Only then, in a later release, drop the old thing.

Steps 1 and 5 must be separate releases. Collapsing them is the single most
common way to take a service down during a deploy.

## Postgres specifics that bite

**Indexes:** always `CREATE INDEX CONCURRENTLY`. A plain `CREATE INDEX` takes an
`ACCESS EXCLUSIVE`-adjacent lock that blocks writes for the whole build. Concurrent
index creation can't run inside a transaction, so the migration needs
`-- flyway:executeInTransaction=false` at the top. A concurrent build that fails
leaves an invalid index behind — check `pg_index.indisvalid` and drop it before
retrying.

**Adding a column:** `ADD COLUMN ... DEFAULT ...` is cheap on modern Postgres (it
no longer rewrites the table), but `NOT NULL` without a default on a populated
table will fail. Add nullable, backfill, then add the constraint.

**Adding a constraint:** add it `NOT VALID` first, then `VALIDATE CONSTRAINT` in a
separate statement. `NOT VALID` takes a brief lock; `VALIDATE` takes a weaker one
and scans without blocking writes. Doing it in one step scans the whole table
under a strong lock.

**Backfills:** never a single `UPDATE` over a large table — it holds row locks
and bloats WAL. Batch by primary key range with a bounded loop, or move the
backfill out of Flyway into a one-off job if it runs for minutes.

**Locks in general:** put a `SET lock_timeout = '3s';` at the top of any migration
that takes a strong lock. Failing fast and retrying is better than a migration
queueing behind a long-running query and then blocking every writer behind
itself.

## Also update

A migration is rarely just SQL. In the same change:

- The JPA entity, if columns changed.
- Any native `@Query` referencing renamed columns — the compiler won't catch these.
- An integration test that exercises the new shape.

## Before you're done

Run the migration against a clean local database and confirm it applies from
scratch, not just as a delta on your current dev state. State the answer to
"what happens if this is rolled back?" — if the answer is "data loss", say so
explicitly rather than leaving it implied.
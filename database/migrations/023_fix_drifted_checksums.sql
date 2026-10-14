-- ==========================================================================
-- 023_fix_drifted_checksums.sql
-- ==========================================================================
--
-- Re-records the checksums of migrations 010 and 012, which have warned on
-- every migration run for weeks:
--
--   [migrate] WARNING: 010_account_profile_media_tryon.sql has changed since
--   it was applied (recorded 02c3831e30c3e759, now 96907332ba60de72)
--
-- WHAT ACTUALLY HAPPENED. Neither file has been edited since it was committed
-- — `git log` shows exactly one commit for each, and the working tree matches
-- it. But NO committed version of either file hashes to what production
-- recorded. So production did not run the committed file: it ran an
-- uncommitted working-tree state, and the file was finished afterwards.
--
-- WHY THIS IS SAFE TO RE-RECORD. The question that matters is not whether the
-- bytes match, it is whether production's SCHEMA matches what the files
-- declare. It does, completely — verified object by object before writing
-- this:
--
--   tables   try_on_history, inventory, inventory_reservations,
--            inventory_transactions                                    4/4 ✓
--   columns  customers.gender (text), reviews.media (jsonb),
--            customer_addresses.is_billing_default (boolean)           3/3 ✓
--   indexes  idx_try_on_history_*, idx_customer_addresses_one_*,
--            idx_inventory_*, idx_reservations_*, idx_inventory_tx_*  16/16 ✓
--
-- Zero objects declared by those files are absent from production. The drift
-- is in the ledger, not in the database — the recorded hash describes a file
-- that no longer exists anywhere, while the schema it produced is exactly what
-- the current file would produce.
--
-- WHY A MIGRATION AND NOT A MANUAL UPDATE. The warning's own advice is "add a
-- new migration instead of editing this one", and the same reasoning applies
-- to the correction: a hand-run UPDATE against production fixes one database
-- and leaves no record of why. This runs everywhere the migrations run, and
-- the explanation lives next to the change.
--
-- WHY IT CANNOT MASK FUTURE DRIFT. Each UPDATE is pinned to the SPECIFIC
-- wrong checksum. It rewrites `02c3831e30c3e759` and nothing else — so if
-- someone edits 010 tomorrow, the warning fires again exactly as it should.
-- An unconditional `SET checksum = <current>` would have blessed every future
-- edit silently, which is the opposite of what this guard is for.
--
-- On any database that never had the drift — a fresh install, a test database
-- — both statements match zero rows and this is a no-op.
-- ==========================================================================

UPDATE schema_migrations
   SET checksum = '96907332ba60de72'
 WHERE version  = '010_account_profile_media_tryon.sql'
   AND checksum = '02c3831e30c3e759';

UPDATE schema_migrations
   SET checksum = 'e579911f6391be5b'
 WHERE version  = '012_sql_inventory.sql'
   AND checksum = 'db8cb2a661880414';

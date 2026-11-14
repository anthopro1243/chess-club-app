/*
 * engineAssessmentWrite.js — save "today's engine assessment" for a player.
 *
 * There is one engine assessment per player per UTC day, enforced by a
 * PARTIAL unique index: (player_id, assessed_on) WHERE source = 'engine'.
 * The store used to write it as an upsert with onConflict
 * 'player_id,assessed_on'. Postgres cannot match an ON CONFLICT target to a
 * partial index unless the statement repeats the index's WHERE clause, and
 * PostgREST has no way to send one, so every one of those upserts failed with
 * "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification". The fallback plain insert then saved the day's FIRST engine
 * assessment and silently dropped every later one (duplicate key), so the
 * day's row never moved as more games were analysed.
 *
 * So: update today's engine row if there is one, otherwise insert. If another
 * tab inserts first, the insert hits the index and this updates instead.
 *
 * The client is passed in so this can be tested without a database.
 */

/** The UTC calendar day of an ISO timestamp — the same value as the generated `assessed_on`. */
export function utcDay(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function updateToday(client, row) {
  const { player_id: playerId, source, ...fields } = row;
  return client
    .from('assessments')
    .update(fields)
    .eq('player_id', playerId)
    .eq('source', 'engine')
    .eq('assessed_on', utcDay(row.assessed_at))
    .select('id');
}

/**
 * @param {object} client a supabase-js client (or anything with the same builder shape)
 * @param {object} row an assessments row with source 'engine' and an ISO `assessed_at`
 * @returns {Promise<{ok: boolean, action?: 'updated'|'inserted', error?: string}>}
 */
export async function writeEngineAssessment(client, row) {
  if (!row?.player_id || row.source !== 'engine' || !row.assessed_at) {
    return { ok: false, error: 'not an engine assessment row' };
  }

  const first = await updateToday(client, row);
  if (first.error) return { ok: false, error: first.error.message };
  if (first.data?.length) return { ok: true, action: 'updated' };

  const inserted = await client.from('assessments').insert(row);
  if (!inserted.error) return { ok: true, action: 'inserted' };
  if (!/duplicate key/i.test(inserted.error.message)) return { ok: false, error: inserted.error.message };

  // Another tab got there between our update and insert: today's row exists now.
  const second = await updateToday(client, row);
  if (second.error) return { ok: false, error: second.error.message };
  return second.data?.length ? { ok: true, action: 'updated' } : { ok: false, error: inserted.error.message };
}

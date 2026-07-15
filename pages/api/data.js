import {
  ensureSchema,
  normalizeSnapshotDate,
  serializeProjectAt,
  STALE_WEEKS,
} from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    const snapshotDate = normalizeSnapshotDate(req.query.date);
    const p = await ensureSchema();
    const stages = (await p.query('SELECT * FROM stages ORDER BY position ASC')).rows;
    const projectRows = (await p.query(
      `SELECT * FROM projects
       WHERE archived = false
         AND ($1::text IS NULL OR created_at < ($1::date + interval '1 day'))
       ORDER BY id ASC`,
      [snapshotDate]
    )).rows;
    const projects = [];
    for (const row of projectRows) projects.push(await serializeProjectAt(p, row, snapshotDate));
    res.status(200).json({ stages, projects, stale_weeks: STALE_WEEKS, snapshot_date: snapshotDate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import { ensureSchema, normalizeSnapshotDate, serializeProjectAt } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const { name, stage_id, comment, timing, effective_date } = req.body || {};
    if (!name || !name.trim() || !stage_id) {
      return res.status(400).json({ error: 'укажите название и начальный этап' });
    }
    const date = normalizeSnapshotDate(effective_date);
    const p = await ensureSchema();
    const pr = await p.query(
      `INSERT INTO projects (name, created_at)
       VALUES ($1, COALESCE(($2::date + time '12:00') AT TIME ZONE 'UTC', now()))
       RETURNING *`,
      [name.trim(), date]
    );
    const pid = pr.rows[0].id;
    await p.query(
      `INSERT INTO status_log (project_id, stage_id, timing, comment, created_at)
       VALUES ($1, $2, $3, $4, COALESCE(($5::date + time '12:00') AT TIME ZONE 'UTC', now()))`,
      [pid, stage_id, timing || null, comment || null, date]
    );
    const result = await serializeProjectAt(p, pr.rows[0], date);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

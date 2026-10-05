import {
  ensureMilestonesForProject,
  ensureSchema,
  normalizeSnapshotDate,
  serializeProjectAt,
} from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const { project_id, stage_id, comment, timing, effective_date } = req.body || {};
    if (!project_id || !stage_id) {
      return res.status(400).json({ error: 'project_id и stage_id обязательны' });
    }
    const date = normalizeSnapshotDate(effective_date);
    const p = await ensureSchema();
    await ensureMilestonesForProject(p, project_id);
    await p.query(
      `INSERT INTO status_log (project_id, stage_id, timing, comment, created_at)
       VALUES ($1, $2, $3, $4, COALESCE(($5::date + time '12:00') AT TIME ZONE 'UTC', now()))`,
      [project_id, stage_id, timing || null, comment || null, date]
    );
    if (date) {
      await p.query(
        `UPDATE stage_milestones
         SET actual_date = COALESCE(actual_date, $3::date), updated_at = now()
         WHERE project_id = $1 AND stage_id = $2`,
        [project_id, stage_id, date]
      );
    }
    const pr = await p.query('SELECT * FROM projects WHERE id = $1', [project_id]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'проект не найден' });
    const result = await serializeProjectAt(p, pr.rows[0], date);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

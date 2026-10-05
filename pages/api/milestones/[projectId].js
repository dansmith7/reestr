import {
  ensureMilestonesForProject,
  ensureSchema,
  normalizeSnapshotDate,
} from '../../../lib/db';

function optionalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeSnapshotDate(value);
}

export default async function handler(req, res) {
  const projectId = Number(req.query.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'некорректный project_id' });
  }

  try {
    const p = await ensureSchema();
    const project = await p.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) return res.status(404).json({ error: 'проект не найден' });
    await ensureMilestonesForProject(p, projectId);

    if (req.method === 'GET') {
      const result = await p.query(
        `SELECT sm.*, s.name AS stage_name, s.position AS stage_position
         FROM stage_milestones sm
         JOIN stages s ON s.id = sm.stage_id
         WHERE sm.project_id = $1
         ORDER BY s.position ASC`,
        [projectId]
      );
      return res.status(200).json({ milestones: result.rows });
    }

    if (req.method === 'PUT') {
      const {
        stage_id,
        baseline_date,
        forecast_date,
        actual_date,
        delay_reason,
        comment,
      } = req.body || {};
      const stageId = Number(stage_id);
      const baseline = optionalDate(baseline_date);
      const forecast = optionalDate(forecast_date);
      const actual = optionalDate(actual_date);

      if (!Number.isInteger(stageId) || stageId <= 0) {
        return res.status(400).json({ error: 'stage_id обязателен' });
      }
      if (
        (baseline_date && !baseline) ||
        (forecast_date && !forecast) ||
        (actual_date && !actual)
      ) {
        return res.status(400).json({ error: 'даты должны быть в формате YYYY-MM-DD' });
      }

      const result = await p.query(
        `UPDATE stage_milestones
         SET baseline_date = $3,
             forecast_date = $4,
             actual_date = $5,
             delay_reason = $6,
             comment = $7,
             updated_at = now()
         WHERE project_id = $1 AND stage_id = $2
         RETURNING *`,
        [
          projectId,
          stageId,
          baseline,
          forecast,
          actual,
          delay_reason?.trim() || null,
          comment?.trim() || null,
        ]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'веха не найдена' });
      return res.status(200).json({ milestone: result.rows[0] });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

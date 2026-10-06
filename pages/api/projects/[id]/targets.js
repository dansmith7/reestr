import {
  ensureSchema,
  ensureTargetsForProject,
  normalizeSnapshotDate,
} from '../../../../lib/db';

function optionalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeSnapshotDate(value);
}

export default async function handler(req, res) {
  const projectId = Number(req.query.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'некорректный id проекта' });
  }

  try {
    const p = await ensureSchema();
    const project = await p.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) return res.status(404).json({ error: 'проект не найден' });
    await ensureTargetsForProject(p, projectId);

    if (req.method === 'GET') {
      const result = await p.query(
        'SELECT planned_submission_date, planned_registry_received_date, updated_at FROM project_targets WHERE project_id = $1',
        [projectId]
      );
      return res.status(200).json({ targets: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const { planned_submission_date, planned_registry_received_date } = req.body || {};
      const submission = optionalDate(planned_submission_date);
      const receipt = optionalDate(planned_registry_received_date);
      if (
        (planned_submission_date && !submission) ||
        (planned_registry_received_date && !receipt)
      ) {
        return res.status(400).json({ error: 'даты должны быть в формате YYYY-MM-DD' });
      }
      const result = await p.query(
        `UPDATE project_targets
         SET planned_submission_date = $2,
             planned_registry_received_date = $3,
             updated_at = now()
         WHERE project_id = $1
         RETURNING planned_submission_date, planned_registry_received_date, updated_at`,
        [projectId, submission, receipt]
      );
      return res.status(200).json({ targets: result.rows[0] });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

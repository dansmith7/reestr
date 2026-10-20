import { ensureSchema } from '../../../../lib/db';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function point(row) {
  return { id: row.id, date: row.date, title: row.title };
}

export default async function handler(req, res) {
  const projectId = Number(req.query.id);
  if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ error: 'Некорректный id проекта' });
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Метод не поддерживается' });

  const body = req.body || {};
  const pointId = Number(body.point_id);
  if (['PUT', 'DELETE'].includes(req.method) && (!Number.isInteger(pointId) || pointId <= 0)) {
    return res.status(400).json({ error: 'Некорректный id точки' });
  }
  const date = req.method === 'POST' || req.method === 'PUT' ? validDate(body.date) : null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!date) return res.status(400).json({ error: 'Укажите корректную дату' });
    if (!title || title.length > 120) return res.status(400).json({ error: 'Название должно содержать от 1 до 120 символов' });
  }

  try {
    const db = await ensureSchema();
    const project = await db.query('SELECT id FROM projects WHERE id = $1 AND archived = false', [projectId]);
    if (!project.rows.length) return res.status(404).json({ error: 'Проект не найден' });

    if (req.method === 'GET') {
      const result = await db.query("SELECT id, to_char(event_date, 'YYYY-MM-DD') AS date, title FROM project_critical_points WHERE project_id = $1 ORDER BY event_date, id", [projectId]);
      return res.status(200).json({ critical_points: result.rows.map(point) });
    }
    if (req.method === 'POST') {
      const result = await db.query("INSERT INTO project_critical_points (project_id, event_date, title) VALUES ($1, $2, $3) RETURNING id, to_char(event_date, 'YYYY-MM-DD') AS date, title", [projectId, date, title]);
      return res.status(201).json({ point: point(result.rows[0]) });
    }
    if (req.method === 'PUT') {
      const result = await db.query("UPDATE project_critical_points SET event_date = $3, title = $4, updated_at = now() WHERE project_id = $1 AND id = $2 RETURNING id, to_char(event_date, 'YYYY-MM-DD') AS date, title", [projectId, pointId, date, title]);
      if (!result.rows.length) return res.status(404).json({ error: 'Точка не найдена' });
      return res.status(200).json({ point: point(result.rows[0]) });
    }
    const result = await db.query('DELETE FROM project_critical_points WHERE project_id = $1 AND id = $2 RETURNING id', [projectId, pointId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Точка не найдена' });
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

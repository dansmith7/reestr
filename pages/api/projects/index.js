import { ensureSchema, serializeProject } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const { name, stage_id, comment, timing } = req.body || {};
    if (!name || !name.trim() || !stage_id) {
      return res.status(400).json({ error: 'укажите название и начальный этап' });
    }
    const p = await ensureSchema();
    const pr = await p.query('INSERT INTO projects (name) VALUES ($1) RETURNING *', [
      name.trim(),
    ]);
    const pid = pr.rows[0].id;
    await p.query(
      'INSERT INTO status_log (project_id, stage_id, timing, comment) VALUES ($1, $2, $3, $4)',
      [pid, stage_id, timing || null, comment || null]
    );
    const result = await serializeProject(p, pr.rows[0]);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

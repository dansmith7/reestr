import { ensureSchema } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const { id } = req.query;
  try {
    const p = await ensureSchema();
    const rows = (
      await p.query(
        `SELECT sl.*, s.name AS stage_name, s.position AS stage_position
         FROM status_log sl JOIN stages s ON s.id = sl.stage_id
         WHERE sl.project_id = $1
         ORDER BY sl.created_at DESC, sl.id DESC`,
        [id]
      )
    ).rows;
    res.status(200).json({ history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import { ensureSchema } from '../../../lib/db';

export default async function handler(req, res) {
  const { id } = req.query;
  try {
    const p = await ensureSchema();
    if (req.method === 'PUT') {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'укажите название' });
      await p.query('UPDATE stages SET name = $1 WHERE id = $2', [name.trim(), id]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const inUse = await p.query(
        'SELECT COUNT(*)::int AS c FROM status_log WHERE stage_id = $1',
        [id]
      );
      if (inUse.rows[0].c > 0) {
        return res
          .status(400)
          .json({ error: 'этап используется в истории проектов, удалить нельзя' });
      }
      await p.query('DELETE FROM stages WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

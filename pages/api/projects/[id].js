import { ensureSchema } from '../../../lib/db';

export default async function handler(req, res) {
  const { id } = req.query;
  try {
    const p = await ensureSchema();
    if (req.method === 'PUT') {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'укажите название' });
      await p.query('UPDATE projects SET name = $1 WHERE id = $2', [name.trim(), id]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await p.query('UPDATE projects SET archived = true WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

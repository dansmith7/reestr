import { ensureSchema } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'укажите название этапа' });
    const p = await ensureSchema();
    const maxRes = await p.query('SELECT COALESCE(MAX(position), -1) AS m FROM stages');
    const pos = maxRes.rows[0].m + 1;
    const r = await p.query(
      'INSERT INTO stages (position, name) VALUES ($1, $2) RETURNING id',
      [pos, name.trim()]
    );
    res.status(201).json({ id: r.rows[0].id, position: pos, name: name.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

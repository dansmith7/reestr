import { ensureSchema } from '../../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { id } = req.query;
  try {
    const { direction } = req.body || {};
    const p = await ensureSchema();
    const rows = (await p.query('SELECT * FROM stages ORDER BY position ASC')).rows;
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'этап не найден' });
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx >= 0 && swapIdx < rows.length) {
      const a = rows[idx];
      const b = rows[swapIdx];
      await p.query('UPDATE stages SET position = $1 WHERE id = $2', [b.position, a.id]);
      await p.query('UPDATE stages SET position = $1 WHERE id = $2', [a.position, b.id]);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import { ensureSchema, serializeProject, STALE_WEEKS } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    const p = await ensureSchema();
    const stages = (await p.query('SELECT * FROM stages ORDER BY position ASC')).rows;
    const projectRows = (
      await p.query('SELECT * FROM projects WHERE archived = false ORDER BY id ASC')
    ).rows;
    const projects = [];
    for (const row of projectRows) projects.push(await serializeProject(p, row));
    res.status(200).json({ stages, projects, stale_weeks: STALE_WEEKS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

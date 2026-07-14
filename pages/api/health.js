import { ensureSchema } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const hasDatabaseUrl = Boolean(
    process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL
  );

  try {
    const p = await ensureSchema();
    const [stages, projects, activeProjects, statusLog] = await Promise.all([
      p.query('SELECT COUNT(*)::int AS c FROM stages'),
      p.query('SELECT COUNT(*)::int AS c FROM projects'),
      p.query('SELECT COUNT(*)::int AS c FROM projects WHERE archived = false'),
      p.query('SELECT COUNT(*)::int AS c FROM status_log'),
    ]);

    res.status(200).json({
      ok: true,
      has_database_url: hasDatabaseUrl,
      counts: {
        stages: stages.rows[0].c,
        projects: projects.rows[0].c,
        active_projects: activeProjects.rows[0].c,
        status_log: statusLog.rows[0].c,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      has_database_url: hasDatabaseUrl,
      error: e.message,
    });
  }
}

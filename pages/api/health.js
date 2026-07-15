import { ensureSchema, getRegistryCounts } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const hasDatabaseUrl = Boolean(
    process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL
  );

  try {
    const p = await ensureSchema();
    const counts = await getRegistryCounts(p);

    res.status(200).json({
      ok: true,
      has_database_url: hasDatabaseUrl,
      counts,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      has_database_url: hasDatabaseUrl,
      error: e.message,
    });
  }
}

import { seedDefaultRegistryData } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const counts = await seedDefaultRegistryData();
    res.status(200).json({ ok: true, counts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

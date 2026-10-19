import { ensureSchema } from '../../../../lib/db';

function cost(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(',', '.');
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Стоимость укажите в рублях, не более двух знаков после запятой');
  const number = Number(normalized);
  if (number > 999999999999.99) throw new Error('Стоимость слишком велика');
  return normalized;
}

function link(value) {
  if (!value) return null;
  const input = String(value).trim();
  if (input.length > 2048) throw new Error('Ссылка слишком длинная');
  let url;
  try { url = new URL(input); } catch { throw new Error('Укажите полную ссылку, начинающуюся с https://'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Допустимы только ссылки http:// и https://');
  return url.toString();
}

export default async function handler(req, res) {
  const projectId = Number(req.query.id);
  if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ error: 'некорректный id проекта' });
  if (req.method !== 'PUT') return res.status(405).json({ error: 'method not allowed' });

  let values;
  try {
    const body = req.body || {};
    const applicationNumber = String(body.application_number || '').trim();
    if (applicationNumber.length > 120) throw new Error('Номер заявки слишком длинный');
    values = [cost(body.pilot_cost), cost(body.production_cost), link(body.gisp_url), applicationNumber || null, link(body.application_url)];
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const p = await ensureSchema();
    const result = await p.query(
      `INSERT INTO project_passports (project_id, pilot_cost, production_cost, gisp_url, application_number, application_url)
       SELECT id, $2, $3, $4, $5, $6 FROM projects WHERE id = $1 AND archived = false
       ON CONFLICT (project_id) DO UPDATE SET
         pilot_cost = EXCLUDED.pilot_cost,
         production_cost = EXCLUDED.production_cost,
         gisp_url = EXCLUDED.gisp_url,
         application_number = EXCLUDED.application_number,
         application_url = EXCLUDED.application_url,
         updated_at = now()
       RETURNING pilot_cost, production_cost, gisp_url, application_number, application_url`,
      [projectId, ...values]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'проект не найден' });
    return res.status(200).json({ passport: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

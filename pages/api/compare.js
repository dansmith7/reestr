import { ensureSchema, normalizeSnapshotDate, serializeProjectAt } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const date = normalizeSnapshotDate(req.query.date);
  const currentDate = normalizeSnapshotDate(req.query.current_date);
  if (!date) return res.status(400).json({ error: 'no date' });
  try {
    const p = await ensureSchema();
    const totalRes = await p.query('SELECT COUNT(*)::int AS c FROM stages');
    const total = totalRes.rows[0].c;
    const projects = (await p.query(
      `SELECT *
       FROM projects
       WHERE archived = false
         AND (
           $1::text IS NULL OR EXISTS (
             SELECT 1 FROM status_log sl
             WHERE sl.project_id = projects.id
               AND sl.created_at < ($1::date + interval '1 day')
           )
         )
       ORDER BY id ASC`,
      [currentDate]
    )).rows;

    const result = [];
    for (const proj of projects) {
      const current = await serializeProjectAt(p, proj, currentDate);

      const pastRes = await p.query(
        `SELECT sl.*, s.name AS stage_name, s.position AS stage_position
         FROM status_log sl JOIN stages s ON s.id = sl.stage_id
         WHERE sl.project_id = $1 AND sl.created_at < ($2::date + interval '1 day')
         ORDER BY sl.created_at DESC, sl.id DESC LIMIT 1`,
        [proj.id, date]
      );
      const past = pastRes.rows[0];

      const betweenRes = await p.query(
        `SELECT sl.*, s.name AS stage_name
         FROM status_log sl JOIN stages s ON s.id = sl.stage_id
         WHERE sl.project_id = $1
           AND sl.created_at >= ($2::date + interval '1 day')
           AND ($3::text IS NULL OR sl.created_at < ($3::date + interval '1 day'))
         ORDER BY sl.created_at ASC`,
        [proj.id, date, currentDate]
      );

      result.push({
        project: proj.name,
        id: proj.id,
        past_status: past ? past.stage_name : 'нет данных на эту дату',
        past_stage_index: past ? past.stage_position : null,
        current_status: current.status,
        current_stage_index: current.stage_index,
        has_past_snapshot: !!past,
        is_new: !past,
        stage_changed: !!(
          past &&
          current.stage_index != null &&
          current.stage_index !== past.stage_position
        ),
        changed: !!(
          past &&
          (current.stage_id !== past.stage_id ||
            current.timing !== past.timing ||
            current.comment !== past.comment)
        ),
        entries_between: betweenRes.rows.map((r) => ({
          date: r.created_at,
          stage: r.stage_name,
          comment: r.comment,
          timing: r.timing,
        })),
      });
    }

    res.status(200).json({ compare: result, total_stages: total, date, current_date: currentDate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

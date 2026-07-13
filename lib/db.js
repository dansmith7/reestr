import { Pool } from 'pg';

export const STALE_WEEKS = 2;

const DEFAULT_STAGES = [
  "Обсуждение условий проекта",
  "Подготовка КД",
  "Производство тестовой партии и подготовка КД",
  "Производство тестовой партии завершено",
  "Подготовка КД завершена",
  "Заявка в ГИСП подготовлена",
  "Заявка в ГИСП подана",
  "Камеральная проверка",
  "Камеральная проверка пройдена",
  "Камеральная проверка на одобрении ЦА ТПП",
  "Планирование выездной проверки",
  "Выездная проверка завершена",
  "Акт экспертизы готовится",
  "Акт экспертизы подготовлен",
  "Акт экспертизы на рассмотрении в МПТ",
];

const DEFAULT_PROJECTS = [
  ["Доработка SR", "Камеральная проверка на одобрении ЦА ТПП", null, "ждём ОС от эксперта"],
  ["Вайфай", "Производство тестовой партии и подготовка КД", "готовность плат в середине августа", null],
  ["Аудиоплата", "Производство тестовой партии и подготовка КД", "готовность плат в середине августа", null],
  ["Планшет", "Обсуждение условий проекта", null, null],
  ["ОПС", "Заявка в ГИСП подготовлена", null, "ждём ОС от эксперта"],
  ["LED", "Обсуждение условий проекта", null, "ждём ОС от эксперта"],
];

let pool;
function getPool() {
  if (!pool) {
    const connectionString =
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL;
    if (!connectionString) {
      throw new Error(
        'Не найдена база данных (POSTGRES_URL). Подключите Postgres в Vercel: проект → Storage → Create Database → Postgres, затем передеплойте проект.'
      );
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

let schemaReady = false;

export async function ensureSchema() {
  const p = getPool();
  if (schemaReady) return p;

  await p.query(`
    CREATE TABLE IF NOT EXISTS stages (
      id SERIAL PRIMARY KEY,
      position INTEGER NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS status_log (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stage_id INTEGER NOT NULL REFERENCES stages(id),
      timing TEXT,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await p.query('SELECT COUNT(*)::int AS c FROM stages');
  if (rows[0].c === 0) {
    const stageIds = {};
    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const r = await p.query(
        'INSERT INTO stages (position, name) VALUES ($1, $2) RETURNING id',
        [i, DEFAULT_STAGES[i]]
      );
      stageIds[DEFAULT_STAGES[i]] = r.rows[0].id;
    }
    for (const [name, status, timing, comment] of DEFAULT_PROJECTS) {
      const pr = await p.query(
        'INSERT INTO projects (name) VALUES ($1) RETURNING id',
        [name]
      );
      const pid = pr.rows[0].id;
      await p.query(
        'INSERT INTO status_log (project_id, stage_id, timing, comment) VALUES ($1, $2, $3, $4)',
        [pid, stageIds[status], timing, comment]
      );
    }
  }

  schemaReady = true;
  return p;
}

export async function serializeProject(p, project) {
  const totalRes = await p.query('SELECT COUNT(*)::int AS c FROM stages');
  const total = totalRes.rows[0].c;

  const latestRes = await p.query(
    `SELECT sl.*, s.name AS stage_name, s.position AS stage_position
     FROM status_log sl JOIN stages s ON s.id = sl.stage_id
     WHERE sl.project_id = $1
     ORDER BY sl.created_at DESC, sl.id DESC LIMIT 1`,
    [project.id]
  );

  if (latestRes.rows.length === 0) {
    return {
      id: project.id,
      name: project.name,
      status: null,
      stage_id: null,
      stage_index: null,
      timing: null,
      comment: null,
      updated_at: null,
      pct: 0,
      total_stages: total,
      stale: false,
      weeks_since_update: null,
    };
  }

  const latest = latestRes.rows[0];
  const weeksSince =
    (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7);

  return {
    id: project.id,
    name: project.name,
    status: latest.stage_name,
    stage_id: latest.stage_id,
    stage_index: latest.stage_position,
    timing: latest.timing,
    comment: latest.comment,
    updated_at: latest.created_at,
    pct: total ? Math.round(((latest.stage_position + 1) / total) * 100) : 0,
    total_stages: total,
    stale: weeksSince >= STALE_WEEKS,
    weeks_since_update: Math.round(weeksSince * 10) / 10,
  };
}

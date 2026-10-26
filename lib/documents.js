import { head } from '@vercel/blob';

export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
export const DOCUMENT_CATEGORIES = new Set(['kd', 'production', 'certificates']);

export function documentPath(projectId, pathname) {
  const match = new RegExp(`^projects/${projectId}/documents/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`, 'i').exec(pathname || '');
  return match?.[1] || null;
}

export function documentName(name) {
  return typeof name === 'string' && name.trim() && name.length <= 255 && !/[\x00-\x1f\x7f]/.test(name) ? name.trim() : null;
}

export function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const password = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
    return password === (process.env.APP_PASSWORD || 'reestr2026');
  } catch { return false; }
}

export function documentRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    name: row.filename,
    type: row.content_type,
    size: Number(row.byte_size),
    addedAt: row.uploaded_at,
  };
}

export async function saveDocument(db, projectId, pathname, category, name) {
  const id = documentPath(projectId, pathname);
  const filename = documentName(name);
  if (!id || !filename || !DOCUMENT_CATEGORIES.has(category)) throw new Error('Некорректные данные файла');
  const metadata = await head(pathname);
  if (!metadata || metadata.size > MAX_DOCUMENT_SIZE) throw new Error('Файл не найден или превышает 20 МБ');
  const result = await db.query(
    `INSERT INTO project_documents (id, project_id, category, filename, content_type, byte_size, pathname)
     SELECT $1, id, $3, $4, $5, $6, $7 FROM projects WHERE id = $2 AND archived = false
     ON CONFLICT (pathname) DO UPDATE SET pathname = EXCLUDED.pathname
     RETURNING *`,
    [id, projectId, category, filename, metadata.contentType || 'application/octet-stream', metadata.size, pathname]
  );
  if (!result.rows.length) throw new Error('Проект не найден');
  return documentRow(result.rows[0]);
}

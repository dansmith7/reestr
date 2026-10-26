import { del, get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { ensureSchema } from '../../../../lib/db';
import { documentPath, saveDocument, documentRow, DOCUMENT_CATEGORIES } from '../../../../lib/documents';

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function purgeDocument(db, projectId, fileId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query("SELECT pathname FROM project_documents WHERE project_id = $1 AND id = $2 AND deleted_at IS NOT NULL AND deleted_at <= now() - interval '6 seconds' FOR UPDATE", [projectId, fileId]);
    if (!rows.rows.length) { await client.query('ROLLBACK'); return false; }
    await del(rows.rows[0].pathname);
    await client.query('DELETE FROM project_documents WHERE project_id = $1 AND id = $2', [projectId, fileId]);
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export default async function handler(req, res) {
  const projectId = Number(req.query.id);
  if (!Number.isInteger(projectId) || projectId < 1) return res.status(400).json({ error: 'Некорректный id проекта' });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Метод не поддерживается' });
  const fileId = req.query.file;
  if (fileId && !validId(fileId)) return res.status(400).json({ error: 'Некорректный id файла' });
  try {
    const db = await ensureSchema();
    const project = await db.query('SELECT id FROM projects WHERE id = $1 AND archived = false', [projectId]);
    if (!project.rows.length) return res.status(404).json({ error: 'Проект не найден' });

    if (req.method === 'GET' && !fileId) {
      // Finish deletions if the browser was closed during the undo window.
      const stale = await db.query("SELECT id FROM project_documents WHERE project_id = $1 AND deleted_at < now() - interval '1 minute' LIMIT 20", [projectId]);
      for (const row of stale.rows) {
        try { await purgeDocument(db, projectId, row.id); } catch (error) { console.error('Document cleanup failed', error); }
      }
      const rows = await db.query('SELECT * FROM project_documents WHERE project_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC', [projectId]);
      return res.status(200).json({ documents: rows.rows.map(documentRow) });
    }
    if (req.method === 'GET' && fileId && req.query.download === '1') {
      const rows = await db.query('SELECT * FROM project_documents WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL', [projectId, fileId]);
      if (!rows.rows.length) return res.status(404).json({ error: 'Файл не найден' });
      const row = rows.rows[0];
      const blob = await get(row.pathname, { access: 'private' });
      if (!blob) return res.status(404).json({ error: 'Файл не найден в хранилище' });
      res.setHeader('Content-Type', row.content_type);
      res.setHeader('Content-Length', row.byte_size);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      Readable.fromWeb(blob.stream).pipe(res);
      return;
    }
    if (req.method === 'POST' && !fileId) {
      const { pathname, category, name } = req.body || {};
      if (!documentPath(projectId, pathname)) return res.status(400).json({ error: 'Некорректный путь файла' });
      const document = await saveDocument(db, projectId, pathname, category, name);
      return res.status(201).json({ document });
    }
    if (!fileId) return res.status(400).json({ error: 'Укажите файл' });
    if (req.method === 'DELETE') {
      const rows = await db.query('UPDATE project_documents SET deleted_at = now() WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id', [projectId, fileId]);
      return rows.rows.length ? res.status(200).json({ deleted: true }) : res.status(404).json({ error: 'Файл не найден' });
    }
    if (req.method === 'PATCH') {
      const action = req.body?.action;
      if (action === 'undo') {
        const rows = await db.query("UPDATE project_documents SET deleted_at = NULL WHERE project_id = $1 AND id = $2 AND deleted_at > now() - interval '1 minute' RETURNING *", [projectId, fileId]);
        return rows.rows.length ? res.status(200).json({ document: documentRow(rows.rows[0]) }) : res.status(404).json({ error: 'Файл не найден' });
      }
      if (action === 'assign' && DOCUMENT_CATEGORIES.has(req.body?.category)) {
        const rows = await db.query('UPDATE project_documents SET category = $3 WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *', [projectId, fileId, req.body.category]);
        return rows.rows.length ? res.status(200).json({ document: documentRow(rows.rows[0]) }) : res.status(404).json({ error: 'Файл не найден' });
      }
      if (action === 'purge') {
        const purged = await purgeDocument(db, projectId, fileId);
        return purged ? res.status(200).json({ deleted: true }) : res.status(409).json({ error: 'Файл уже восстановлен или ещё может быть восстановлен' });
      }
    }
    return res.status(400).json({ error: 'Некорректный запрос' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка обработки документа' });
  }
}

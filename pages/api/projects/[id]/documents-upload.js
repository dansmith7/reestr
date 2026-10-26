import { handleUpload } from '@vercel/blob/client';
import { ensureSchema } from '../../../../lib/db';
import { authorized, documentPath, documentName, DOCUMENT_CATEGORIES, MAX_DOCUMENT_SIZE, saveDocument } from '../../../../lib/documents';

export default async function handler(req, res) {
  const projectId = Number(req.query.id);
  if (req.method !== 'POST' || !Number.isInteger(projectId) || projectId < 1) return res.status(400).json({ error: 'Некорректный запрос' });
  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        if (!authorized(req)) throw new Error('Нет доступа');
        const data = JSON.parse(payload || '{}');
        if (!documentPath(projectId, pathname) || !DOCUMENT_CATEGORIES.has(data.category) || !documentName(data.name) || !Number.isInteger(data.size) || data.size < 0 || data.size > MAX_DOCUMENT_SIZE) throw new Error('Некорректные данные файла');
        const db = await ensureSchema();
        const project = await db.query('SELECT id FROM projects WHERE id = $1 AND archived = false', [projectId]);
        if (!project.rows.length) throw new Error('Проект не найден');
        return { maximumSizeInBytes: MAX_DOCUMENT_SIZE, addRandomSuffix: false, tokenPayload: JSON.stringify({ projectId, category: data.category, name: data.name }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const data = JSON.parse(tokenPayload || '{}');
        if (data.projectId !== projectId || !documentPath(projectId, blob.pathname)) throw new Error('Некорректный файл');
        const db = await ensureSchema();
        await saveDocument(db, projectId, blob.pathname, data.category, data.name);
      },
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Не удалось загрузить файл' });
  }
}

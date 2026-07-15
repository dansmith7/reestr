export default function Admin() {
  return (
    <>
      <style jsx global>{`
        body {
          margin: 0;
          font-family: Mulish, Arial, sans-serif;
          background: #f7f7f7;
          color: #222;
        }
        .wrap {
          max-width: 920px;
          margin: 0 auto;
          padding: 32px 24px 56px;
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.15;
        }
        .muted {
          color: #8b8b8b;
          margin-top: 6px;
          font-size: 14px;
        }
        .panel {
          background: #fff;
          border: 1px solid #e7e7e7;
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 18px;
        }
        button,
        a.btn {
          border: 1px solid #e7e7e7;
          border-radius: 10px;
          padding: 10px 16px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
          background: #fff;
          color: #222;
          text-decoration: none;
        }
        button.primary {
          background: #60d812;
          border-color: #60d812;
          color: #fff;
        }
        pre {
          white-space: pre-wrap;
          word-break: break-word;
          background: #f7f7f7;
          border: 1px solid #e7e7e7;
          border-radius: 10px;
          padding: 14px;
          min-height: 120px;
          font-size: 13px;
          line-height: 1.5;
        }
        .hint {
          color: #666;
          font-size: 13px;
          line-height: 1.5;
          margin-top: 14px;
        }
      `}</style>
      <main className="wrap">
        <div className="top">
          <div>
            <h1>Админка реестра</h1>
            <div className="muted">Проверка Neon и заполнение стартовыми данными</div>
          </div>
          <a className="btn" href="/">На сайт</a>
        </div>

        <section className="panel">
          <div className="actions">
            <button id="checkBtn">Проверить базу</button>
            <button className="primary" id="seedBtn">Внести стартовые данные</button>
          </div>
          <pre id="result">Нажмите «Проверить базу».</pre>
          <div className="hint">
            Нормальное состояние: 15 этапов, 6 активных проектов, 6 записей истории.
            Если переменная базы не подключена, здесь будет видно `has_database_url: false`.
          </div>
        </section>
      </main>

      <script
        dangerouslySetInnerHTML={{
          __html: `
const result = document.getElementById('result');
function show(data) {
  result.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}
async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  if (!res.ok) throw data;
  return data;
}
document.getElementById('checkBtn').addEventListener('click', async () => {
  show('Проверяю...');
  try { show(await request('/api/health')); } catch (e) { show(e); }
});
document.getElementById('seedBtn').addEventListener('click', async () => {
  show('Вношу стартовые данные...');
  try { show(await request('/api/admin/seed', { method: 'POST' })); } catch (e) { show(e); }
});
          `,
        }}
      />
    </>
  );
}

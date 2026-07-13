import { NextResponse } from 'next/server';

// Простая Basic Auth защита. Пароль по умолчанию — "reestr2026".
// Чтобы сменить пароль: Vercel → проект → Settings → Environment Variables →
// добавить APP_PASSWORD со своим значением → Redeploy.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export default function middleware(req) {
  const expected = process.env.APP_PASSWORD || 'reestr2026';
  const auth = req.headers.get('authorization');

  if (auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme?.toLowerCase() === 'basic' && encoded) {
      let decoded = '';
      try {
        decoded = atob(encoded);
      } catch (e) {
        decoded = '';
      }
      const idx = decoded.indexOf(':');
      const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      if (pass === expected) {
        return NextResponse.next();
      }
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Reestr Status"',
    },
  });
}

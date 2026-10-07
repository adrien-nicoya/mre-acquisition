// Protection par mot de passe (active seulement si DASHBOARD_PASSWORD est défini).
export const config = { matcher: '/((?!_vercel|api/snapshot).*)' };

export default function middleware(req) {
  const pwd = process.env.DASHBOARD_PASSWORD;
  if (!pwd) return;
  const auth = req.headers.get('authorization') || '';
  const user = process.env.DASHBOARD_USER || 'admin';
  const [, b64] = auth.split(' ');
  const [u, ...rest] = b64 ? atob(b64).split(':') : [];
  if (u === user && rest.join(':') === pwd) return;
  return new Response('Accès protégé', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Dashboard acquisition"' },
  });
}

import crypto from 'crypto';
import { GetCurrentAuthUserResponse } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';

import {
  clearSession,
  createSession,
  getSessionId,
  isSecureCookie,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/password';

const router: IRouter = Router();

const LoginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
});

function toAuthUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

function getSafeReturnTo(value: unknown, fallback = '/'): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return fallback;
  }
  return value;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function getBootstrapCredentials() {
  const email = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.AUTH_ADMIN_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  return user;
}

async function bootstrapAdmin(email: string, password: string) {
  const bootstrap = getBootstrapCredentials();
  if (!bootstrap) return null;
  if (bootstrap.email !== email || bootstrap.password !== password) return null;

  const passwordHash = await hashPassword(bootstrap.password);
  const name = process.env.AUTH_ADMIN_NAME?.trim() || 'Administrador';
  const [firstName, ...rest] = name.split(/\s+/);

  const [user] = await db
    .insert(usersTable)
    .values({
      id: crypto.randomUUID(),
      email: bootstrap.email,
      passwordHash,
      firstName,
      lastName: rest.join(' ') || null,
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: {
        passwordHash,
        updatedAt: new Date(),
      },
    })
    .returning();

  return user;
}

router.get('/auth/user', (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post('/auth/login', async (req: Request, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  try {
    const existing = await findUserByEmail(email);
    let user: typeof existing | undefined = existing;

    if (!user) {
      user = (await bootstrapAdmin(email, password)) ?? undefined;
    } else if (!user.passwordHash) {
      const bootstrapped = await bootstrapAdmin(email, password);
      if (bootstrapped) user = bootstrapped;
    }

    if (!user) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    const sessionData: SessionData = { user: toAuthUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.json({ user: sessionData.user });
  } catch (error) {
    req.log.error({ err: error }, 'Login failed');
    res.status(500).json({ error: 'Não foi possível entrar agora.' });
  }
});

router.get('/auth/google', (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.redirect(
      '/?error=' +
        encodeURIComponent(
          'Login com Google não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
        ),
    );
    return;
  }

  const redirectUri = getGoogleRedirectUri(req);
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('g_state', state, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', clientId);
  googleUrl.searchParams.set('redirect_uri', redirectUri);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');

  res.redirect(googleUrl.toString());
});

router.get('/auth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error || !code || typeof code !== 'string') {
    res.redirect(
      '/?error=' + encodeURIComponent('Falha ou cancelamento do login com o Google.'),
    );
    return;
  }

  const savedState = req.cookies?.['g_state'];
  if (savedState && state && savedState !== state) {
    res.redirect(
      '/?error=' + encodeURIComponent('Estado de autenticação inválido.'),
    );
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(
      '/?error=' +
        encodeURIComponent('Credenciais do Google não configuradas no servidor.'),
    );
    return;
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      req.log.error({ errBody }, 'Google token exchange failed');
      res.redirect(
        '/?error=' + encodeURIComponent('Falha ao validar autorização do Google.'),
      );
      return;
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      res.redirect(
        '/?error=' + encodeURIComponent('Token de acesso do Google não retornado.'),
      );
      return;
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      res.redirect(
        '/?error=' +
          encodeURIComponent('Não foi possível obter dados do perfil do Google.'),
      );
      return;
    }

    const profile = (await userRes.json()) as {
      email?: string;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      res.redirect(
        '/?error=' + encodeURIComponent('E-mail não fornecido pelo Google.'),
      );
      return;
    }

    const email = profile.email.toLowerCase();
    const firstName =
      profile.given_name || profile.name?.split(' ')[0] || 'Usuário';
    const lastName =
      profile.family_name ||
      profile.name?.split(' ').slice(1).join(' ') ||
      null;
    const profileImageUrl = profile.picture || null;

    const [user] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        email,
        firstName,
        lastName,
        profileImageUrl,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          firstName,
          lastName,
          profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    const sessionData: SessionData = { user: toAuthUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.clearCookie('g_state', { path: '/' });
    res.redirect('/');
  } catch (err) {
    req.log.error({ err }, 'Google callback error');
    res.redirect(
      '/?error=' + encodeURIComponent('Erro ao concluir autenticação com o Google.'),
    );
  }
});

router.post('/auth/google/credential', async (req: Request, res: Response) => {
  const { credential } = (req.body ?? {}) as { credential?: unknown };
  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Credencial do Google não fornecida.' });
    return;
  }

  try {
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    if (!verifyRes.ok) {
      res.status(401).json({ error: 'Token do Google inválido ou expirado.' });
      return;
    }

    const profile = (await verifyRes.json()) as {
      email?: string;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      res.status(400).json({ error: 'E-mail não fornecido pelo Google.' });
      return;
    }

    const email = profile.email.toLowerCase();
    const firstName =
      profile.given_name || profile.name?.split(' ')[0] || 'Usuário';
    const lastName =
      profile.family_name ||
      profile.name?.split(' ').slice(1).join(' ') ||
      null;
    const profileImageUrl = profile.picture || null;

    const [user] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        email,
        firstName,
        lastName,
        profileImageUrl,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          firstName,
          lastName,
          profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    const sessionData: SessionData = { user: toAuthUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.json({ user: sessionData.user });
  } catch (err) {
    req.log.error({ err }, 'Google credential verification error');
    res.status(500).json({ error: 'Erro ao validar conta Google.' });
  }
});

function getGoogleRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : req.protocol || 'https';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0].trim()
      : req.get('host') || 'localhost:5000';
  return `${proto}://${host}/api/auth/google/callback`;
}

router.get('/login', (req: Request, res: Response) => {
  res.redirect(getSafeReturnTo(req.query.returnTo));
});

router.get('/callback', (_req: Request, res: Response) => {
  res.redirect('/');
});

router.get('/logout', async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect(returnTo);
});

export default router;

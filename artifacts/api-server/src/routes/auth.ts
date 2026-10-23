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

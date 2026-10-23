import type { AuthUser } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { type NextFunction, type Request, type Response } from 'express';

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

let cachedOwner: Express.User | null = null;

async function getOrCreateOwner(): Promise<Express.User> {
  if (cachedOwner) return cachedOwner;

  try {
    const [existing] = await db.select().from(usersTable).limit(1);
    if (existing) {
      cachedOwner = {
        id: existing.id,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        profileImageUrl: existing.profileImageUrl,
      };
      return cachedOwner;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        id: 'default-owner',
        email: 'oficina@local',
        firstName: 'Oficina',
        lastName: '3D',
      })
      .onConflictDoNothing()
      .returning();

    cachedOwner = {
      id: created?.id || 'default-owner',
      email: created?.email || 'oficina@local',
      firstName: created?.firstName || 'Oficina',
      lastName: created?.lastName || '3D',
      profileImageUrl: null,
    };
    return cachedOwner;
  } catch {
    return {
      id: 'default-owner',
      email: 'oficina@local',
      firstName: 'Oficina',
      lastName: '3D',
      profileImageUrl: null,
    };
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function () {
    return true;
  } as Request['isAuthenticated'];

  req.user = await getOrCreateOwner();
  next();
}

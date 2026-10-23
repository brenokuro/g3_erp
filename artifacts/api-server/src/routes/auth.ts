import { GetCurrentAuthUserResponse } from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

const router: IRouter = Router();

router.get('/auth/user', (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.user ?? null,
    }),
  );
});

router.post('/auth/login', (req: Request, res: Response) => {
  res.json({ user: req.user });
});

router.get('/auth/google', (_req: Request, res: Response) => {
  res.redirect('/');
});

router.get('/auth/google/callback', (_req: Request, res: Response) => {
  res.redirect('/');
});

router.get('/login', (_req: Request, res: Response) => {
  res.redirect('/');
});

router.get('/callback', (_req: Request, res: Response) => {
  res.redirect('/');
});

router.get('/logout', (_req: Request, res: Response) => {
  res.redirect('/');
});

export default router;

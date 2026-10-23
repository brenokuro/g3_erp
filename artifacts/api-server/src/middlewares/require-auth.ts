import type { RequestHandler } from "express";

const requireAuth: RequestHandler = (_req, _res, next) => {
  next();
};

export default requireAuth;

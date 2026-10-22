import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import requireAuth from "../middlewares/require-auth";
import clientsRouter from "./clients";
import ordersRouter from "./orders";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(storageRouter);
router.use(dashboardRouter);
router.use(clientsRouter);
router.use(ordersRouter);

export default router;

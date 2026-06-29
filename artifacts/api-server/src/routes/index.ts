import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import messagesRouter from "./messages";
import botRouter from "./bot";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(messagesRouter);
router.use(botRouter);
router.use(statsRouter);

export default router;

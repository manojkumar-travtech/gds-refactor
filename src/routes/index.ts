import { Router } from "express";
import sabreSessionRoutes from "./sabre.session.routes";
import apexRoutes from "./api.routes";

const router = Router();

router.use("/sabre", sabreSessionRoutes);

router.use("/apex", apexRoutes);

export default router;

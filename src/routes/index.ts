import { Router } from "express";
import sabreSessionRoutes from "./sabre.session.routes";
import apexRoutes from "./api.routes";
import profileRoutes from "./profile.routes";

const router = Router();

router.use("/sabre", sabreSessionRoutes);

router.use("/apex", apexRoutes);

router.use("/checking" ,profileRoutes);
export default router;

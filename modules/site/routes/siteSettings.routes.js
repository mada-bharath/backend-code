import express from "express";
import {
  getPublicPolicy,
  getPublicSiteSettings,
} from "../controllers/siteSettings.controller.js";

const router = express.Router();

router.get("/", getPublicSiteSettings);
router.get("/footer", getPublicSiteSettings);
router.get("/policies/:type", getPublicPolicy);

export default router;

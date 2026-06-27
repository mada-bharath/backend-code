import express from "express";
import { protect } from "../../../shared/middleware/auth.middleware.js";
import { allowRoles } from "../../../shared/middleware/role.middleware.js";
import {
  addToWishlist,
  bulkAddWishlistToCart,
  checkWishlist,
  clearWishlist,
  getPublicWishlist,
  getWishlist,
  removeFromWishlist,
  updateWishlistItem,
  updateWishlistSettings,
} from "../controllers/wishlist.controller.js";

const router = express.Router();
const wishlistRoles = allowRoles("student", "instructor");

router.get("/public/:slug", getPublicWishlist);
router.get("/", protect, wishlistRoles, getWishlist);
router.post("/", protect, wishlistRoles, addToWishlist);
router.delete("/", protect, wishlistRoles, clearWishlist);
router.patch("/settings", protect, wishlistRoles, updateWishlistSettings);
router.post("/bulk/cart", protect, wishlistRoles, bulkAddWishlistToCart);
router.get("/check/:courseId", protect, wishlistRoles, checkWishlist);
router.post("/:courseId", protect, wishlistRoles, addToWishlist);
router.patch("/:courseId", protect, wishlistRoles, updateWishlistItem);
router.delete("/:courseId", protect, wishlistRoles, removeFromWishlist);

export default router;

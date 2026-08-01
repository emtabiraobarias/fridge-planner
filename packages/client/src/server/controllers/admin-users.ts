import 'server-only';
import { InventoryItem } from '../models/inventory-item';
import { MealPlan } from '../models/meal-plan';
import { GroceryList } from '../models/grocery-list';
import { record as auditRecord } from '../lib/audit';
import { problem, type ControllerResult } from '../http';

/**
 * Administrator support view (spec 011 US3 — FR-AD-015/016/021).
 *
 * Read-only by construction: this module exports exactly one function and it performs
 * no writes. There is deliberately **no update or delete path** here and no write verb
 * on the route, so "read-only" is enforced by absence rather than by a flag someone can
 * flip. Admin *writes* to another user's data are out of scope for spec 011.
 *
 * Exists because a user reporting "my grocery list is wrong" was previously
 * uninvestigable — every query is `{ userId }`-scoped, so the maintainer could not look
 * at the data being described.
 *
 * Cross-user access is legitimate here only because the route is admin-guarded, and
 * every call is audited (FR-AD-021) — that audit is what makes the access accountable.
 */

const MAX_ITEMS = 500;

export interface SupportViewCounts {
  inventoryItems: number;
  mealPlans: number;
  groceryLists: number;
}

/**
 * GET /api/v1/admin/users/:userId/data — a read-only snapshot of one user's kitchen.
 *
 * Bounded: each collection is capped so a support lookup can never become an unbounded
 * dump. The counts are returned alongside so a truncated view is visible as truncated
 * rather than silently partial.
 */
export async function adminGetUserData(
  adminUserId: string,
  targetUserId: string,
): Promise<ControllerResult> {
  if (!targetUserId.trim()) {
    return problem(400, 'Invalid input', 'A user id is required');
  }

  const [inventory, mealPlans, groceryLists, counts] = await Promise.all([
    InventoryItem.find({ userId: targetUserId }).sort({ expiresAt: 1 }).limit(MAX_ITEMS).lean(),
    MealPlan.find({ userId: targetUserId }).sort({ weekStart: -1 }).limit(20).lean(),
    GroceryList.find({ userId: targetUserId }).sort({ weekStart: -1 }).limit(20).lean(),
    Promise.all([
      InventoryItem.countDocuments({ userId: targetUserId }),
      MealPlan.countDocuments({ userId: targetUserId }),
      GroceryList.countDocuments({ userId: targetUserId }),
    ]),
  ]);

  const [inventoryItems, mealPlanCount, groceryListCount] = counts;

  // Audited BEFORE the response is returned: the access has happened by this point,
  // and an unrecorded read is exactly what FR-AD-021 forbids.
  await auditRecord(adminUserId, 'user.data.view', { userId: targetUserId, type: 'account' });

  return {
    status: 200,
    body: {
      userId: targetUserId,
      counts: {
        inventoryItems,
        mealPlans: mealPlanCount,
        groceryLists: groceryListCount,
      } satisfies SupportViewCounts,
      inventory,
      mealPlans,
      groceryLists,
    },
  };
}

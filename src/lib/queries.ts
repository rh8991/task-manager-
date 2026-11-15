import type { QueryOpts } from "./data";

/**
 * Shared query filters. Pages load only what they show (open tasks, active requests), so
 * reads stay well inside Firebase's free 50,000/day even after months of finished work piles up.
 * "in" counts as an equality filter, so these need no extra indexes.
 */
export const OPEN_TASKS: QueryOpts = { where: ["status", "in", ["TODO", "IN_PROGRESS", "BLOCKED"]] };
export const ACTIVE_EQUIPMENT: QueryOpts = { where: ["status", "in", ["PENDING", "APPROVED", "ORDERED"]] };
export const ACTIVE_MEETINGS: QueryOpts = { where: ["status", "in", ["OPEN", "SCHEDULED"]] };

/** Start of the hour, 7 days ago (rounded so the query key stays stable between renders). */
export function weekAgo(): number {
  const hour = 3_600_000;
  return Math.floor(Date.now() / hour) * hour - 7 * 24 * hour;
}

import { adminProcedure } from '@/backend/trpc/create-context';
import { buildRevenueWorkbook } from '@/backend/lib/admin-excel';
import { loadAdminRevenueSummary, revenueSummaryInput } from '../getSummary/route';

export default adminProcedure.input(revenueSummaryInput).mutation(async ({ input }) => {
  const summary = await loadAdminRevenueSummary(input);
  return buildRevenueWorkbook(summary);
});

import { z } from 'zod';

export const Raw990RecordSchema = z.object({
  ein: z.string().min(9),
  name: z.string().min(1),
  city: z.string(),
  state: z.string(),
  nteeCode: z.string(),
  totalAssets: z.number().default(0),
  totalRevenue: z.number().default(0),
  totalGiving: z.number().optional(),
  fiscalYearEnd: z.string()
});

export const RawGrantRecordSchema = z.object({
  opportunityId: z.string().min(1),
  opportunityTitle: z.string().min(1),
  agencyName: z.string(),
  awardCeiling: z.number().default(0),
  awardFloor: z.number().default(0),
  closeDate: z.string(),
  eligibleApplicants: z.array(z.string()).default([]),
  categoryOfFunding: z.string().default('Other'),
  applicationUrl: z.string().url().optional()
});

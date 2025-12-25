import { Raw990RecordSchema, RawGrantRecordSchema } from '../validators';

describe('Data Ingestion Validators', () => {
  describe('IRS 990 Schema', () => {
    it('should accept valid 990 records', () => {
      const valid = {
        ein: '12-3456789',
        name: 'Test Charity',
        city: 'Honolulu',
        state: 'HI',
        nteeCode: 'A10',
        totalAssets: 100000,
        totalRevenue: 50000,
        fiscalYearEnd: '2023-12'
      };
      expect(() => Raw990RecordSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid EINs', () => {
      const invalid = {
        ein: '123', // Too short
        name: 'Bad Charity',
        city: 'City',
        state: 'ST',
        nteeCode: 'A',
        totalAssets: 0,
        totalRevenue: 0,
        fiscalYearEnd: '2023'
      };
      expect(() => Raw990RecordSchema.parse(invalid)).toThrow();
    });
  });

  describe('Grants.gov Schema', () => {
    it('should accept valid grant records', () => {
      const valid = {
        opportunityId: 'OPP-123',
        opportunityTitle: 'Test Grant',
        agencyName: 'NSF',
        closeDate: '2025-01-01'
      };
      // It should apply defaults
      const parsed = RawGrantRecordSchema.parse(valid);
      expect(parsed.awardCeiling).toBe(0);
      expect(parsed.categoryOfFunding).toBe('Other');
    });

    it('should reject missing titles', () => {
      const invalid = {
        opportunityId: 'OPP-123',
        // missing title
        agencyName: 'NSF'
      };
      expect(() => RawGrantRecordSchema.parse(invalid)).toThrow();
    });
  });
});

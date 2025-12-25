#!/bin/bash
set -e

echo "🛠️  Starting Part 7: Testing Infrastructure..."

# ---------------------------------------------------------
# STEP 1: Configure Jest for TypeScript
# ---------------------------------------------------------
echo "📝 Creating jest.config.js..."
cat << 'YW_JEST' > jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx)', '**/?(*.)+(spec|test).+(ts|tsx)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  verbose: true,
};
YW_JEST

# ---------------------------------------------------------
# STEP 2: Create Unit Tests for Kala Engine
# ---------------------------------------------------------
# We need to mock the database connection since we can't run FalkorDB in CI easily
echo "📝 Creating src/modules/kala-engine/kala.test.ts..."
mkdir -p src/modules/kala-engine/__tests__

cat << 'YW_TEST_KALA' > src/modules/kala-engine/__tests__/kala.test.ts
import { KalaEngine } from '../index';
import { GraphConnection } from '../../graph-core';

// Mock the GraphConnection
const mockMutate = jest.fn();
const mockQuery = jest.fn();
const mockConnection = {
  mutate: mockMutate,
  query: mockQuery,
} as unknown as GraphConnection;

describe('Kala Engine', () => {
  let engine: KalaEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new KalaEngine(mockConnection);
  });

  describe('calculateKala', () => {
    it('should calculate 50 Kala for 60 minutes', () => {
      const result = engine.calculateKala(60);
      expect(result.kalaGenerated).toBe(50);
    });

    it('should calculate 25 Kala for 30 minutes', () => {
      const result = engine.calculateKala(30);
      expect(result.kalaGenerated).toBe(25);
    });

    it('should throw error for negative duration', () => {
      expect(() => engine.calculateKala(-10)).toThrow();
    });

    it('should round to 2 decimal places', () => {
      // 45 mins = 37.5 Kala
      const result = engine.calculateKala(45);
      expect(result.kalaGenerated).toBe(37.5);
    });
  });

  describe('recordContribution', () => {
    it('should create contribution node and edges', async () => {
      mockMutate.mockResolvedValue({ nodesCreated: 1 });
      
      const contribution = await engine.recordContribution('person-123', 120, {
        projectId: 'proj-abc'
      });

      expect(contribution.kalaGenerated).toBe(100); // 2 hours = 100 Kala
      expect(contribution.synced).toBe(true);
      
      // Verify DB calls
      expect(mockMutate).toHaveBeenCalledTimes(3); // Create Node, Link Person, Link Project
    });
  });
});
YW_TEST_KALA

# ---------------------------------------------------------
# STEP 3: Create Validation Tests (Zod)
# ---------------------------------------------------------
echo "📝 Creating src/modules/data-ingestion/validators.test.ts..."
mkdir -p src/modules/data-ingestion/__tests__

cat << 'YW_TEST_ZOD' > src/modules/data-ingestion/__tests__/validators.test.ts
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
YW_TEST_ZOD

# ---------------------------------------------------------
# STEP 4: Run the Tests
# ---------------------------------------------------------
echo "🧪 Running Tests..."
npm test

# ---------------------------------------------------------
# STEP 5: Commit
# ---------------------------------------------------------
echo "💾 Committing Part 7..."
git add jest.config.js src/modules/kala-engine/__tests__/ src/modules/data-ingestion/__tests__/
git commit -m "Refactor: Added automated testing suite"
git push origin main

echo "✅ Part 7 Complete! The repo is now fully refactored and tested."

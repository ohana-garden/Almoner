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

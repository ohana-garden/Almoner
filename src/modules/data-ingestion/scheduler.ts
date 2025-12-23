/**
 * Data Ingestion Scheduler
 *
 * Manages periodic data ingestion from external sources.
 * Uses a simple interval-based scheduler suitable for Railway deployment.
 *
 * Knows NOTHING about: Kala, volunteers, UI, matching logic
 */

import type { DataIngestionEngine, IngestionJob } from './index';

/** Schedule configuration */
export interface ScheduleConfig {
  /** Cron-like schedule (simplified: 'daily', 'weekly', 'monthly') */
  frequency: 'daily' | 'weekly' | 'monthly';
  /** Hour of day to run (0-23) */
  hour: number;
  /** Enabled sources */
  sources: {
    irs990: boolean;
    grantsGov: boolean;
  };
  /** 990 years to ingest (most recent N years) */
  irs990Years: number;
  /** Grants.gov search keywords */
  grantsGovKeywords?: string[];
}

/** Schedule state */
interface ScheduleState {
  lastRun: Date | null;
  nextRun: Date;
  activeJobs: IngestionJob[];
  errors: string[];
}

/**
 * Data Ingestion Scheduler
 *
 * Runs periodic ingestion jobs based on configuration.
 */
export class IngestionScheduler {
  private engine: DataIngestionEngine;
  private config: ScheduleConfig;
  private state: ScheduleState;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(engine: DataIngestionEngine, config: ScheduleConfig) {
    this.engine = engine;
    this.config = config;
    this.state = {
      lastRun: null,
      nextRun: this.calculateNextRun(),
      activeJobs: [],
      errors: [],
    };
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.timer) {
      return; // Already running
    }

    console.log(`Scheduler started. Next run: ${this.state.nextRun.toISOString()}`);

    // Check every minute if it's time to run
    this.timer = setInterval(() => {
      this.checkAndRun();
    }, 60 * 1000);

    // Also check immediately
    this.checkAndRun();
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Scheduler stopped.');
    }
  }

  /**
   * Get current scheduler state.
   */
  getState(): ScheduleState {
    return { ...this.state };
  }

  /**
   * Manually trigger an ingestion run.
   */
  async runNow(): Promise<IngestionJob[]> {
    return this.runIngestion();
  }

  /**
   * Check if it's time to run and trigger if so.
   */
  private checkAndRun(): void {
    const now = new Date();

    if (now >= this.state.nextRun) {
      this.runIngestion().catch((error) => {
        this.state.errors.push(`Run failed: ${error.message}`);
      });

      this.state.lastRun = now;
      this.state.nextRun = this.calculateNextRun();

      console.log(`Ingestion triggered. Next run: ${this.state.nextRun.toISOString()}`);
    }
  }

  /**
   * Run the actual ingestion jobs.
   */
  private async runIngestion(): Promise<IngestionJob[]> {
    const jobs: IngestionJob[] = [];

    // IRS 990 ingestion
    if (this.config.sources.irs990) {
      const currentYear = new Date().getFullYear();
      const yearsToIngest = this.config.irs990Years || 1;

      for (let i = 0; i < yearsToIngest; i++) {
        const year = currentYear - 1 - i; // Start from previous year
        try {
          console.log(`Starting 990 ingestion for year ${year}...`);
          const job = await this.engine.ingest990Year(year);
          jobs.push(job);
        } catch (error) {
          this.state.errors.push(
            `990 year ${year}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Grants.gov ingestion
    if (this.config.sources.grantsGov) {
      const keywords = this.config.grantsGovKeywords || ['nonprofit', 'community'];

      for (const keyword of keywords) {
        try {
          console.log(`Starting Grants.gov ingestion for keyword: ${keyword}...`);
          const job = await this.engine.ingestGrantsGov({ keyword });
          jobs.push(job);
        } catch (error) {
          this.state.errors.push(
            `Grants.gov "${keyword}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    this.state.activeJobs = jobs;
    return jobs;
  }

  /**
   * Calculate the next run time based on configuration.
   */
  private calculateNextRun(): Date {
    const now = new Date();
    const next = new Date(now);

    // Set to configured hour
    next.setHours(this.config.hour, 0, 0, 0);

    // If we've passed today's run time, move to next occurrence
    if (next <= now) {
      switch (this.config.frequency) {
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }

    return next;
  }
}

/**
 * Create a scheduler with default configuration.
 */
export function createScheduler(
  engine: DataIngestionEngine,
  config?: Partial<ScheduleConfig>
): IngestionScheduler {
  const defaultConfig: ScheduleConfig = {
    frequency: 'weekly',
    hour: 3, // 3 AM
    sources: {
      irs990: true,
      grantsGov: true,
    },
    irs990Years: 2,
    grantsGovKeywords: ['nonprofit', 'community development', 'education'],
  };

  return new IngestionScheduler(engine, { ...defaultConfig, ...config });
}

/**
 * Environment-based scheduler configuration.
 */
export function loadSchedulerConfig(): ScheduleConfig {
  return {
    frequency: (process.env.INGESTION_FREQUENCY as ScheduleConfig['frequency']) || 'weekly',
    hour: parseInt(process.env.INGESTION_HOUR || '3', 10),
    sources: {
      irs990: process.env.INGESTION_IRS990 !== 'false',
      grantsGov: process.env.INGESTION_GRANTS_GOV !== 'false',
    },
    irs990Years: parseInt(process.env.INGESTION_990_YEARS || '2', 10),
    grantsGovKeywords: process.env.INGESTION_GRANTS_KEYWORDS?.split(',') || [
      'nonprofit',
      'community development',
    ],
  };
}

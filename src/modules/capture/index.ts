/**
 * Capture Module (Offline-First)
 *
 * Purpose: Record contributions from volunteers
 * Dependencies: Graph Core (for sync), Kala Engine
 *
 * Offline behavior: All data stored locally, Kala calculated locally, sync when able
 *
 * Knows NOTHING about: Grants, matching, funders
 *
 * First Principle: Capture is ritual.
 * Volunteers actively claim their contribution (tap + photo/video). Not surveillance.
 *
 * First Principle: Offline-first.
 * Lower Puna has crappy connectivity. Everything must work disconnected and sync when able.
 *
 * VIOLATION WARNING:
 * - Requiring connectivity for contribution capture → WRONG
 * - Passive location tracking without explicit volunteer action → WRONG
 */

import type { Contribution, Site, Project, Person } from '../../types/nodes';

/** Status of a pending contribution */
export type CaptureStatus = 'pending' | 'syncing' | 'synced' | 'error';

/** Local contribution record (stored in IndexedDB on client) */
export interface LocalContribution {
  id: string;
  personId: string;
  siteId?: string;
  projectId?: string;
  timestamp: Date;
  duration: number; // minutes
  kalaGenerated: number;
  mediaRef?: string; // Local file reference
  mediaData?: Blob; // Actual media data for sync
  status: CaptureStatus;
  lastSyncAttempt?: Date;
  syncError?: string;
}

/** NFC tap event */
export interface NfcTapEvent {
  tagId: string;
  timestamp: Date;
}

/** Capture session for tracking in/out times */
export interface CaptureSession {
  id: string;
  personId: string;
  siteId: string;
  projectId?: string;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
}

/** Sync result */
export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Capture Manager
 *
 * Handles offline-first contribution capture.
 *
 * First Principle: Capture is ritual.
 * Every contribution is an intentional act by the volunteer.
 *
 * First Principle: Offline-first.
 * All operations work without network connectivity.
 */
export class CaptureManager {
  private activeSession: CaptureSession | null = null;
  private pendingContributions: Map<string, LocalContribution> = new Map();

  /** Callback for when sync is needed */
  private onSyncNeeded?: () => void;

  /** Kala rate: 50 per hour */
  private static readonly KALA_PER_HOUR = 50;

  constructor() {
    // In browser, would load from IndexedDB here
    this.loadFromStorage();
  }

  /**
   * Set callback for sync needed events.
   */
  setSyncCallback(callback: () => void): void {
    this.onSyncNeeded = callback;
  }

  /**
   * Start a capture session (NFC tap in or manual start).
   *
   * First Principle: Capture is ritual.
   * This is an intentional action by the volunteer.
   */
  startSession(personId: string, siteId: string, projectId?: string): CaptureSession {
    // End any existing session first
    if (this.activeSession) {
      this.endSession();
    }

    this.activeSession = {
      id: crypto.randomUUID(),
      personId,
      siteId,
      projectId,
      startTime: new Date(),
      isActive: true,
    };

    this.saveToStorage();
    return this.activeSession;
  }

  /**
   * Handle NFC tap event.
   *
   * First Principle: Capture is ritual.
   * The tap is the volunteer's intentional claim of their contribution.
   */
  handleNfcTap(tap: NfcTapEvent, personId: string, siteMapping: Map<string, Site>): {
    action: 'start' | 'end' | 'unknown';
    session?: CaptureSession;
    contribution?: LocalContribution | null;
  } {
    const site = siteMapping.get(tap.tagId);

    if (!site) {
      return { action: 'unknown' };
    }

    // If no active session, start one
    if (!this.activeSession) {
      const session = this.startSession(personId, site.id);
      return { action: 'start', session };
    }

    // If tapping the same site, end the session
    if (this.activeSession.siteId === site.id) {
      const contribution = this.endSession();
      return { action: 'end', contribution };
    }

    // Tapping a different site - end current, start new
    this.endSession();
    const session = this.startSession(personId, site.id);
    return { action: 'start', session };
  }

  /**
   * End the current capture session.
   *
   * First Principle: Offline-first.
   * Kala is calculated locally. Sync happens later.
   */
  endSession(): LocalContribution | null {
    if (!this.activeSession || !this.activeSession.isActive) {
      return null;
    }

    const endTime = new Date();
    const durationMinutes = Math.round(
      (endTime.getTime() - this.activeSession.startTime.getTime()) / (1000 * 60)
    );

    // Calculate Kala locally (same formula as Kala Engine)
    const kalaGenerated = (durationMinutes / 60) * CaptureManager.KALA_PER_HOUR;

    const contribution: LocalContribution = {
      id: crypto.randomUUID(),
      personId: this.activeSession.personId,
      siteId: this.activeSession.siteId,
      projectId: this.activeSession.projectId,
      timestamp: this.activeSession.startTime,
      duration: durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100,
      status: 'pending',
    };

    this.pendingContributions.set(contribution.id, contribution);
    this.activeSession.endTime = endTime;
    this.activeSession.isActive = false;
    this.activeSession = null;

    this.saveToStorage();
    this.notifySyncNeeded();

    return contribution;
  }

  /**
   * Quick capture for a completed contribution.
   *
   * First Principle: Capture is ritual.
   * Used when volunteer knows their duration (e.g., "I worked 2 hours").
   */
  quickCapture(
    personId: string,
    durationMinutes: number,
    options: {
      siteId?: string;
      projectId?: string;
      mediaData?: Blob;
      timestamp?: Date;
    } = {}
  ): LocalContribution {
    const kalaGenerated = (durationMinutes / 60) * CaptureManager.KALA_PER_HOUR;

    const contribution: LocalContribution = {
      id: crypto.randomUUID(),
      personId,
      siteId: options.siteId,
      projectId: options.projectId,
      timestamp: options.timestamp || new Date(),
      duration: durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100,
      mediaData: options.mediaData,
      status: 'pending',
    };

    this.pendingContributions.set(contribution.id, contribution);
    this.saveToStorage();
    this.notifySyncNeeded();

    return contribution;
  }

  /**
   * Attach media to a pending contribution.
   *
   * First Principle: Capture is ritual.
   * Photo/video is optional evidence of the contribution.
   */
  attachMedia(contributionId: string, mediaData: Blob): boolean {
    const contribution = this.pendingContributions.get(contributionId);
    if (!contribution) {
      return false;
    }

    contribution.mediaData = mediaData;
    contribution.mediaRef = `local:${contributionId}`;
    this.saveToStorage();

    return true;
  }

  /**
   * Get all pending (unsynced) contributions.
   */
  getPendingContributions(): LocalContribution[] {
    return Array.from(this.pendingContributions.values()).filter(
      (c) => c.status === 'pending' || c.status === 'error'
    );
  }

  /**
   * Get the active session, if any.
   */
  getActiveSession(): CaptureSession | null {
    return this.activeSession;
  }

  /**
   * Prepare contributions for sync.
   * Returns data ready to send to the server.
   */
  prepareForSync(): Array<{
    contribution: Omit<LocalContribution, 'mediaData'>;
    hasMedia: boolean;
  }> {
    return this.getPendingContributions().map((c) => ({
      contribution: {
        id: c.id,
        personId: c.personId,
        siteId: c.siteId,
        projectId: c.projectId,
        timestamp: c.timestamp,
        duration: c.duration,
        kalaGenerated: c.kalaGenerated,
        mediaRef: c.mediaRef,
        status: c.status,
        lastSyncAttempt: c.lastSyncAttempt,
        syncError: c.syncError,
      },
      hasMedia: !!c.mediaData,
    }));
  }

  /**
   * Mark contributions as synced.
   *
   * First Principle: Offline-first.
   * Called after successful sync to server.
   */
  markSynced(contributionIds: string[]): void {
    for (const id of contributionIds) {
      const contribution = this.pendingContributions.get(id);
      if (contribution) {
        contribution.status = 'synced';
        // Remove media data to save space
        contribution.mediaData = undefined;
      }
    }

    // Remove fully synced contributions
    for (const id of contributionIds) {
      const contribution = this.pendingContributions.get(id);
      if (contribution?.status === 'synced') {
        this.pendingContributions.delete(id);
      }
    }

    this.saveToStorage();
  }

  /**
   * Mark a contribution as failed to sync.
   */
  markSyncFailed(contributionId: string, error: string): void {
    const contribution = this.pendingContributions.get(contributionId);
    if (contribution) {
      contribution.status = 'error';
      contribution.syncError = error;
      contribution.lastSyncAttempt = new Date();
    }
    this.saveToStorage();
  }

  /**
   * Get statistics for a person (from local data).
   */
  getLocalStats(personId: string): {
    pendingContributions: number;
    pendingKala: number;
    pendingMinutes: number;
    activeSession: boolean;
    sessionDuration?: number;
  } {
    const pending = Array.from(this.pendingContributions.values()).filter(
      (c) => c.personId === personId
    );

    const stats = {
      pendingContributions: pending.length,
      pendingKala: pending.reduce((sum, c) => sum + c.kalaGenerated, 0),
      pendingMinutes: pending.reduce((sum, c) => sum + c.duration, 0),
      activeSession: this.activeSession?.personId === personId,
      sessionDuration: undefined as number | undefined,
    };

    if (stats.activeSession && this.activeSession) {
      stats.sessionDuration = Math.round(
        (Date.now() - this.activeSession.startTime.getTime()) / (1000 * 60)
      );
    }

    return stats;
  }

  /**
   * Clear all local data (for testing or logout).
   */
  clearAll(): void {
    this.pendingContributions.clear();
    this.activeSession = null;
    this.saveToStorage();
  }

  /**
   * Check if localStorage is available (browser environment).
   */
  private hasLocalStorage(): boolean {
    try {
      return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Load state from storage (IndexedDB in browser).
   */
  private loadFromStorage(): void {
    // In browser, this would load from IndexedDB
    // Server-side or in tests, this is a no-op
    if (this.hasLocalStorage()) {
      try {
        const data = window.localStorage.getItem('almoner_capture');
        if (data) {
          const parsed = JSON.parse(data);

          // Restore pending contributions
          if (parsed.pendingContributions) {
            for (const [id, contribution] of Object.entries(parsed.pendingContributions)) {
              const c = contribution as LocalContribution;
              c.timestamp = new Date(c.timestamp);
              if (c.lastSyncAttempt) {
                c.lastSyncAttempt = new Date(c.lastSyncAttempt);
              }
              this.pendingContributions.set(id, c);
            }
          }

          // Restore active session
          if (parsed.activeSession) {
            parsed.activeSession.startTime = new Date(parsed.activeSession.startTime);
            if (parsed.activeSession.endTime) {
              parsed.activeSession.endTime = new Date(parsed.activeSession.endTime);
            }
            this.activeSession = parsed.activeSession;
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  /**
   * Save state to storage (IndexedDB in browser).
   */
  private saveToStorage(): void {
    // In browser, this would save to IndexedDB
    if (this.hasLocalStorage()) {
      try {
        const data = {
          pendingContributions: Object.fromEntries(
            Array.from(this.pendingContributions.entries()).map(([id, c]) => [
              id,
              { ...c, mediaData: undefined }, // Don't store media in localStorage
            ])
          ),
          activeSession: this.activeSession,
        };
        window.localStorage.setItem('almoner_capture', JSON.stringify(data));
      } catch {
        // Ignore storage errors (quota exceeded, etc.)
      }
    }
  }

  /**
   * Notify that sync is needed.
   */
  private notifySyncNeeded(): void {
    if (this.onSyncNeeded) {
      // Use setTimeout to allow any current operations to complete
      setTimeout(() => this.onSyncNeeded?.(), 0);
    }
  }
}

/**
 * Create a Capture Manager.
 */
export function createCaptureManager(): CaptureManager {
  return new CaptureManager();
}

/**
 * Sync Service - handles syncing local data to the graph
 *
 * First Principle: Offline-first.
 * This service runs when connectivity is available.
 */
export class SyncService {
  private captureManager: CaptureManager;
  private apiEndpoint: string;
  private isSyncing: boolean = false;

  constructor(captureManager: CaptureManager, apiEndpoint: string) {
    this.captureManager = captureManager;
    this.apiEndpoint = apiEndpoint;

    // Set up sync callback
    captureManager.setSyncCallback(() => this.attemptSync());
  }

  /**
   * Check if we're in a browser environment with navigator.
   */
  private isOnline(): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    // In Node.js environment, assume we're online
    return true;
  }

  /**
   * Attempt to sync pending contributions.
   */
  async attemptSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0, errors: ['Sync already in progress'] };
    }

    // Check connectivity
    if (!this.isOnline()) {
      return { synced: 0, failed: 0, errors: ['No network connectivity'] };
    }

    this.isSyncing = true;
    const result: SyncResult = { synced: 0, failed: 0, errors: [] };

    try {
      const toSync = this.captureManager.prepareForSync();

      for (const item of toSync) {
        try {
          // Send to API
          const response = await fetch(`${this.apiEndpoint}/contributions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.contribution),
          });

          if (response.ok) {
            this.captureManager.markSynced([item.contribution.id]);
            result.synced++;
          } else {
            const error = await response.text();
            this.captureManager.markSyncFailed(item.contribution.id, error);
            result.failed++;
            result.errors.push(`${item.contribution.id}: ${error}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.captureManager.markSyncFailed(item.contribution.id, message);
          result.failed++;
          result.errors.push(`${item.contribution.id}: ${message}`);
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Start automatic sync when online.
   */
  startAutoSync(intervalMs: number = 60000): void {
    // Sync on connectivity change (browser only)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.attemptSync());
    }

    // Periodic sync
    setInterval(() => {
      if (this.isOnline()) {
        this.attemptSync();
      }
    }, intervalMs);
  }
}

/**
 * Create a Sync Service.
 */
export function createSyncService(
  captureManager: CaptureManager,
  apiEndpoint: string
): SyncService {
  return new SyncService(captureManager, apiEndpoint);
}

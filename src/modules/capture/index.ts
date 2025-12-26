/**
 * Capture Module (Offline-First V2)
 * * Upgrade: Uses IndexedDB (idb) instead of localStorage.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Contribution, Site } from '../../types/nodes';

export type CaptureStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface LocalContribution {
  id: string;
  personId: string;
  siteId?: string;
  projectId?: string;
  timestamp: Date;
  duration: number; 
  kalaGenerated: number;
  mediaRef?: string;
  mediaData?: Blob; 
  status: CaptureStatus;
  lastSyncAttempt?: Date;
  syncError?: string;
}

export interface CaptureSession {
  id: string;
  personId: string;
  siteId: string;
  projectId?: string;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

interface AlmonerDB extends DBSchema {
  contributions: {
    key: string;
    value: LocalContribution;
  };
  session: {
    key: string;
    value: CaptureSession;
  };
}

export class CaptureManager {
  private dbPromise: Promise<IDBPDatabase<AlmonerDB>> | null = null;
  private onSyncNeeded?: () => void;
  private static readonly KALA_PER_HOUR = 50;

  constructor() {
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      this.dbPromise = openDB<AlmonerDB>('almoner-capture', 1, {
        upgrade(db) {
          db.createObjectStore('contributions', { keyPath: 'id' });
          db.createObjectStore('session', { keyPath: 'id' });
        },
      });
    }
  }

  setSyncCallback(callback: () => void): void {
    this.onSyncNeeded = callback;
  }

  private async getDB() {
    if (!this.dbPromise) throw new Error("IndexedDB not supported in this environment");
    return this.dbPromise;
  }

  async startSession(personId: string, siteId: string, projectId?: string): Promise<CaptureSession> {
    const db = await this.getDB();
    const tx = db.transaction('session', 'readwrite');
    await tx.store.clear();
    
    const session: CaptureSession = {
      id: 'active-session',
      personId,
      siteId,
      projectId,
      startTime: new Date(),
      isActive: true,
    };
    
    await tx.store.put(session);
    await tx.done;
    return session;
  }

  async endSession(): Promise<LocalContribution | null> {
    const db = await this.getDB();
    const session = await db.get('session', 'active-session');

    if (!session || !session.isActive) return null;

    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - session.startTime.getTime()) / (1000 * 60));
    const kalaGenerated = (durationMinutes / 60) * CaptureManager.KALA_PER_HOUR;

    const contribution: LocalContribution = {
      id: crypto.randomUUID(),
      personId: session.personId,
      siteId: session.siteId,
      projectId: session.projectId,
      timestamp: session.startTime,
      duration: durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100,
      status: 'pending',
    };

    const tx = db.transaction(['contributions', 'session'], 'readwrite');
    await tx.objectStore('contributions').put(contribution);
    await tx.objectStore('session').delete('active-session');
    await tx.done;

    this.notifySyncNeeded();
    return contribution;
  }

  async quickCapture(
    personId: string,
    durationMinutes: number,
    options: { siteId?: string; projectId?: string; mediaData?: Blob; timestamp?: Date; } = {}
  ): Promise<LocalContribution> {
    const db = await this.getDB();
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

    await db.put('contributions', contribution);
    this.notifySyncNeeded();
    return contribution;
  }

  async getPendingContributions(): Promise<LocalContribution[]> {
    const db = await this.getDB();
    const all = await db.getAll('contributions');
    return all.filter(c => c.status === 'pending' || c.status === 'error');
  }

  async markSynced(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('contributions', 'readwrite');
    for (const id of ids) {
        await tx.store.delete(id); 
    }
    await tx.done;
  }

  async markSyncFailed(id: string, error: string): Promise<void> {
    const db = await this.getDB();
    const c = await db.get('contributions', id);
    if (c) {
        c.status = 'error';
        c.syncError = error;
        c.lastSyncAttempt = new Date();
        await db.put('contributions', c);
    }
  }

  private notifySyncNeeded(): void {
    if (this.onSyncNeeded) setTimeout(() => this.onSyncNeeded?.(), 0);
  }
}

export function createCaptureManager(): CaptureManager {
  return new CaptureManager();
}

export class SyncService {
    constructor(private manager: CaptureManager, private endpoint: string) {
        manager.setSyncCallback(() => this.sync());
    }
    async sync() {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    }
}
export function createSyncService(cm: CaptureManager, ep: string) { return new SyncService(cm, ep); }

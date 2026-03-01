import { config } from '../../config';

type PollingState = 'active' | 'reduced' | 'deep_inactive' | 'paused';

interface SymbolInterval {
  symbol: string;
  baseInterval: number;
  currentInterval: number;
}

class PollingManager {
  private lastActivity = Date.now();
  private state: PollingState = 'active';
  private symbolIntervals = new Map<string, SymbolInterval>();
  private checkTimer: NodeJS.Timeout | null = null;

  start(): void {
    this.checkTimer = setInterval(() => this.checkState(), 10_000);
    console.log('[Polling] Adaptive polling manager started');
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
    if (this.state !== 'active') {
      this.state = 'active';
      this.updateAllIntervals();
      console.log('[Polling] User active — full speed polling');
    }
  }

  getState(): PollingState {
    return this.state;
  }

  getIntervalForSymbol(symbol: string): number {
    const entry = this.symbolIntervals.get(symbol.toUpperCase());
    if (!entry) return this.getDefaultInterval();
    return entry.currentInterval;
  }

  setSymbolInterval(symbol: string, intervalMs: number): void {
    const s = symbol.toUpperCase();
    const existing = this.symbolIntervals.get(s);
    if (existing) {
      existing.baseInterval = intervalMs;
      existing.currentInterval = this.adjustInterval(intervalMs);
    } else {
      this.symbolIntervals.set(s, {
        symbol: s,
        baseInterval: intervalMs,
        currentInterval: this.adjustInterval(intervalMs),
      });
    }
  }

  removeSymbol(symbol: string): void {
    this.symbolIntervals.delete(symbol.toUpperCase());
  }

  getStats(): {
    state: PollingState;
    lastActivity: number;
    inactiveMs: number;
    trackedSymbols: number;
  } {
    return {
      state: this.state,
      lastActivity: this.lastActivity,
      inactiveMs: Date.now() - this.lastActivity,
      trackedSymbols: this.symbolIntervals.size,
    };
  }

  private checkState(): void {
    const elapsed = Date.now() - this.lastActivity;
    let newState = this.state;

    if (elapsed >= config.polling.pauseTimeout) {
      newState = 'paused';
    } else if (elapsed >= config.polling.deepInactiveTimeout) {
      newState = 'deep_inactive';
    } else if (elapsed >= config.polling.inactiveTimeout) {
      newState = 'reduced';
    } else {
      newState = 'active';
    }

    if (newState !== this.state) {
      this.state = newState;
      console.log(`[Polling] State changed to: ${newState}`);
      this.updateAllIntervals();
    }
  }

  private updateAllIntervals(): void {
    for (const [, entry] of this.symbolIntervals) {
      entry.currentInterval = this.adjustInterval(entry.baseInterval);
    }
  }

  private adjustInterval(baseInterval: number): number {
    switch (this.state) {
      case 'active':
        return baseInterval;
      case 'reduced':
        return baseInterval * 4; // 1/4 speed
      case 'deep_inactive':
        return Math.max(baseInterval * 12, config.polling.deepInactiveInterval);
      case 'paused':
        return Infinity; // effectively paused
    }
  }

  private getDefaultInterval(): number {
    switch (this.state) {
      case 'active':
        return config.polling.activeInterval;
      case 'reduced':
        return config.polling.reducedInterval;
      case 'deep_inactive':
        return config.polling.deepInactiveInterval;
      case 'paused':
        return Infinity;
    }
  }
}

export const pollingManager = new PollingManager();

import type { TeamStore, SharedFact } from './teamStore.js';

export type LocalWriter = (content: string) => Promise<void>;

export class TeamSyncer {
  private lastSync = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly remote: TeamStore,
    private readonly writeLocal: LocalWriter,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.sync(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(): Promise<SharedFact[]> {
    const newFacts = this.remote.readAll(this.lastSync);
    if (newFacts.length > 0) {
      this.lastSync = newFacts[newFacts.length - 1]!.createdAt;
      for (const fact of newFacts) {
        await this.writeLocal(fact.content);
      }
    }
    return newFacts;
  }
}

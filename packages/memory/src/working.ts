export class WorkingMemory {
  private readonly _store = new Map<string, Map<string, unknown>>();

  private _bucket(taskId: string): Map<string, unknown> {
    let b = this._store.get(taskId);
    if (b === undefined) {
      b = new Map();
      this._store.set(taskId, b);
    }
    return b;
  }

  get<T = unknown>(taskId: string, key: string): T | undefined {
    return this._bucket(taskId).get(key) as T | undefined;
  }

  set<T = unknown>(taskId: string, key: string, value: T): void {
    this._bucket(taskId).set(key, value);
  }

  delete(taskId: string, key: string): boolean {
    return this._bucket(taskId).delete(key);
  }

  clear(taskId: string): void {
    this._store.delete(taskId);
  }

  keys(taskId: string): string[] {
    const b = this._store.get(taskId);
    return b !== undefined ? [...b.keys()] : [];
  }

  has(taskId: string, key: string): boolean {
    return this._store.get(taskId)?.has(key) ?? false;
  }
}

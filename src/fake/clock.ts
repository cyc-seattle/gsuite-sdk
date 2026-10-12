/** The time the fake reads, in epoch milliseconds. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock that moves only when told to, so a test can step past the fake's delays at once. */
export class ManualClock implements Clock {
  constructor(private time = 0) {}

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}

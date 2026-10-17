import type { JobRecord, JobRepository } from '@trailogue/database';

export type JobHandler = (job: JobRecord) => Promise<void>;

interface JobWorkerOptions {
  repository: JobRepository;
  workerId: string;
  handler: JobHandler;
  pollIntervalMs?: number;
}

export class JobWorker {
  private stopped = false;
  private readonly pollIntervalMs: number;

  constructor(private readonly options: JobWorkerOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
  }

  async runOnce(): Promise<boolean> {
    const job = await this.options.repository.claimNext(this.options.workerId);
    if (!job) return false;

    try {
      await this.options.handler(job);
      await this.options.repository.complete(job.id, this.options.workerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker error';
      await this.options.repository.fail(job.id, this.options.workerId, message);
    }
    return true;
  }

  async start(): Promise<void> {
    while (!this.stopped) {
      const processed = await this.runOnce();
      if (!processed) await wait(this.pollIntervalMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

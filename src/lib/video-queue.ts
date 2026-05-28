/**
 * Tiny in-process FIFO queue with a fixed concurrency cap. Used to throttle
 * background video transcodes so that even if the user dumps 10 clips at
 * once we don't spawn 10 parallel ffmpeg processes and grind the host.
 *
 * Not persistent: a server restart loses any queued/in-flight jobs. The DB
 * boot recovery in `db.ts` flips orphaned 'processing' rows to 'failed' so
 * the UI shows them as such rather than spinning forever.
 */

const MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.VIDEO_CONCURRENCY ?? "1"),
);

type Job = () => Promise<void>;
const pending: Job[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift()!;
    active++;
    Promise.resolve()
      .then(() => job())
      .catch((err) => {
        // Jobs are expected to handle their own errors; this catch only
        // exists to keep one rogue rejection from killing the queue.
        console.error("[video-queue] unhandled job error:", err);
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

/** Schedule `job` for background execution. Returns immediately. */
export function enqueueVideoJob(job: Job): void {
  pending.push(job);
  pump();
}

export function queueStats() {
  return { active, pending: pending.length };
}

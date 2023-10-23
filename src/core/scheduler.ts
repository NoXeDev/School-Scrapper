import { CronJob } from "cron";

export default class Sheduler {
  private schedulesJob: Map<string, CronJob>;
  constructor() {
    this.schedulesJob = new Map<string, CronJob>();
  }
  public bindAJob(eventName: string, scheduleRule: string, callback: () => Promise<void>, startnow = false): void {
    const job: CronJob = new CronJob(
      scheduleRule,
      async () => {
        await callback();
      },
      null,
      true,
      "Europe/Paris",
      null,
      startnow,
    );
    this.schedulesJob.set(eventName, job);
  }

  public deleteAJob(eventName: string): void {
    this.schedulesJob.get(eventName)?.stop();
    this.schedulesJob.delete(eventName);
  }
}

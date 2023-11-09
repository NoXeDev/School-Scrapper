import "dotenv/config";
import { InstanceManager } from "./core/instanceManager.js";
import { Logger } from "tslog";

// Main ASYNC WRAPPER
(async () => {
  const rootLogs = new Logger({ name: "root" });
  process.on("uncaughtException", (err) => {
    rootLogs.error(err);
  });

  if (!process.env.BULLETIN || !process.env.CAS2) {
    rootLogs.fatal("Missing env variables");
    process.exit(-2);
  }

  await InstanceManager.launch(); // Main core function
})();

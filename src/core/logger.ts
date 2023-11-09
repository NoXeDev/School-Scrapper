import { ILogObj, IMeta, Logger } from "tslog";
import { AppInstance } from "./appInstance.js";
import axios from "axios";
import { isNativeError } from "util/types";

enum ELogLevelColors {
  INFO = 0x33ecff,
  WARN = 0xf9ff33,
  ERROR = 0xff6833,
  FATAL = 0xa533ff,
}

export class AppLogger {
  private static netWeebHook?: string;
  private static logger = new Logger({ argumentsArrayName: "logArgs" });

  public static setWebHook(webhook: string) {
    this.netWeebHook = webhook;
    this.logger.attachTransport(this.transportWebHook.bind(this));
  }

  public static getLogger() {
    return this.logger;
  }

  public static getInstanceSubLogger(instance: AppInstance) {
    return this.logger.getSubLogger({ name: instance.cfg.instance_name });
  }

  private static transportWebHook(LogObj: ILogObj) {
    if (this.netWeebHook) {
      const logMeta: IMeta = LogObj["_meta"] as IMeta;
      const logType: string = logMeta.logLevelName;
      const arrayLogs = LogObj["logArgs"] as Array<any>;

      const fieldArray = new Array<any>();
      if (logMeta.name) {
        fieldArray.push({
          name: "Instance name",
          value: logMeta.name,
        });
      }

      fieldArray.push({
        name: "Date",
        value: "`" + logMeta.date.toString() + "`",
      });
      for (let i = 0; i < arrayLogs.length; i++) {
        if (typeof arrayLogs[i] === "string") {
          fieldArray.push({
            name: "Log",
            value: arrayLogs[i],
          });
        } else if (typeof arrayLogs[i] == "object" && isNativeError(arrayLogs[i].nativeError)) {
          const error = arrayLogs[i].nativeError;
          fieldArray.push({
            name: error?.cause ? error.toString() + " " + error.cause.toString() : error.toString(),
            value: "```txt\n" + error.stack.toString() + "\n```",
          });
        }
      }
      axios.post(this.netWeebHook, {
        embeds: [
          {
            title: logType,
            color: ELogLevelColors[logType] ? ELogLevelColors[logType] : 0x33ff3c,
            footer: {
              text: `SchoolScrap v${process.env.VERSION} © NoXeDev`,
              icon_url: "https://cdn.discordapp.com/avatars/343445422909423628/6449855d48118dd5830bc12cd1b201bd.webp?size=128",
            },
            fields: fieldArray,
          },
        ],
      });
    }
  }
}

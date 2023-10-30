import axios from "axios";
import fs from "fs";
import Ajv, { ValidateFunction, JSONSchemaType } from "ajv";

export enum ELogType {
  INFO,
  WARNING,
  ERROR,
  CRITIAL,
}

export interface RichLog {
  type: ELogType;
  message: string;
  instanceName?: string;
  quickCode?: number;
  moduleName: string;
  detail?: string;
  emote?: string;
}

const RichLogSchema: JSONSchemaType<RichLog> = {
  type: "object",
  properties: {
    message: { type: "string" },
    instanceName: { type: "string", nullable: true },
    type: { type: "integer" },
    moduleName: { type: "string" },
    quickCode: { type: "integer", nullable: true },
    detail: { type: "string", nullable: true },
    emote: { type: "string", nullable: true },
  },
  required: ["message", "moduleName", "type"],
};

export class AppLogger {
  private static fallback_webhook?: string;
  private static savePath = "./logs";

  public static async log(content: string | RichLog, netLog = true) {
    if (!this.fallback_webhook || this.fallback_webhook == "") {
      netLog = false;
    }
    if (!fs.existsSync(this.savePath)) {
      fs.mkdirSync(this.savePath.replace("./", ""));
    }
    if (!fs.existsSync(this.savePath + "/main.txt")) {
      fs.writeFileSync(this.savePath + "/main.txt", "", "utf-8");
    }

    if (typeof content == "string") {
      console.log(content);
      if (netLog) {
        this.webhook_log(content);
      }
      return;
    }

    let emote: string;
    switch (content.type) {
      case ELogType.INFO: {
        emote = "✅";
        break;
      }

      case ELogType.WARNING: {
        emote = "⚠️";
        break;
      }

      case ELogType.ERROR: {
        emote = "❌";
        break;
      }

      case ELogType.CRITIAL: {
        emote = "🚫";
        break;
      }

      default: {
        emote = "";
        break;
      }
    }
    if (content.emote) {
      emote = content.emote;
    }

    const rawStr = `${emote} [${new Date().toLocaleString()}] - [${content.instanceName ? content.instanceName + ":" : ""}${
      content.moduleName
    } - v${process.env.VERSION}]${content.quickCode ? " (" + content.quickCode + ")" : ""} :  ${content.message}${
      content.detail
        ? `\nDetails :\n \`${typeof content.detail == "object" ? JSON.stringify(content.detail) : content.detail}\``
        : ""
    }`;

    console.log(rawStr); // Log into console
    await fs.promises.appendFile(this.savePath + "/main.txt", rawStr + "\n", "utf-8"); // Log into logfile
    if (netLog) {
      await this.webhook_log(rawStr); // Log into webhook (only if option is enable)
    }
  }

  private static async webhook_log(message: string) {
    if (!this.fallback_webhook) return;
    try {
      await axios.post(this.fallback_webhook, { content: message });
    } catch (e) {
      console.error(e); // bruh moment for the app
    }
  }

  public static isRichLog(e: any): boolean {
    const ajv: Ajv = new Ajv();
    const compiler: ValidateFunction = ajv.compile(RichLogSchema);
    return compiler(e);
  }

  public static async setWebHookLog(webhook: string) {
    this.fallback_webhook = webhook;
  }

  public static print(e: any) {
    if (!process.env.NODE_ENV) {
      console.log(e);
    }
  }
}

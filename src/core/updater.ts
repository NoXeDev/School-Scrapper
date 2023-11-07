import axios, { AxiosResponse } from "axios";
import { execSync } from "child_process";
import { ELogType } from "./logger.js";

export type IUpdateCfg = { flushDB: boolean; flushLogs: boolean };

export default class Updater {
  public static async checkForUpdates(): Promise<IUpdateCfg | null> {
    const urlApi: string = process.env.URL;
    const latestTagRelease: AxiosResponse<any, any> = await axios.get(
      "https://api.github.com/repos/" + urlApi.replace("git+https://github.com/", "") + "/releases/latest",
    );

    if (latestTagRelease.data["tag_name"]) {
      if (process.env.VERSION !== latestTagRelease.data["tag_name"]) {
        if (latestTagRelease.data["body"]) {
          const bodyParsed = latestTagRelease.data["body"].split("/");
          return {
            flushDB: bodyParsed[0] == "true" ? true : false,
            flushLogs: bodyParsed[1] == "true" ? true : false,
          };
        } else {
          return {
            flushDB: false,
            flushLogs: false,
          };
        }
      } else {
        return null;
      }
    } else {
      throw {
        message: "Updater bad datas",
        type: ELogType.WARNING,
        moduleName: "Updater",
        quickCode: -1,
      };
    }
  }

  public static async update(config: IUpdateCfg) {
    try {
      let extensionStr = "";
      if (config.flushDB) {
        extensionStr += "--flush-database ";
      }
      if (config.flushLogs) {
        extensionStr += "--flush-logs";
      }
      execSync("node ./scripts/remote-deploy.js --update " + extensionStr);
    } catch (e) {
      throw {
        message: "Updater failed to launch deploy script",
        type: ELogType.WARNING,
        moduleName: "Updater",
        detail: e.toString(),
      };
    }
  }
}

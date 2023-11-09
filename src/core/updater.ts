import axios, { AxiosResponse } from "axios";
import { execSync } from "child_process";

export type IUpdateCfg = { flushDB: boolean; flushLogs: boolean; newVersion: string };

export default class Updater {
  public static async checkForUpdates(): Promise<IUpdateCfg | null> {
    const urlApi: string = process.env.URL;
    const latestTagRelease: AxiosResponse<any, any> = await axios
      .get("https://api.github.com/repos/" + urlApi.replace("git+https://github.com/", "") + "/releases/latest")
      .catch((err) => {
        throw new Error("Failed to fetch github API", { cause: err });
      });

    if (latestTagRelease.data["tag_name"]) {
      if (process.env.VERSION !== latestTagRelease.data["tag_name"]) {
        if (latestTagRelease.data["body"]) {
          const bodyParsed = latestTagRelease.data["body"].split("/");
          return {
            flushDB: bodyParsed[0] == "true" ? true : false,
            flushLogs: bodyParsed[1] == "true" ? true : false,
            newVersion: latestTagRelease.data["tag_name"],
          };
        } else {
          return {
            flushDB: false,
            flushLogs: false,
            newVersion: latestTagRelease.data["tag_name"],
          };
        }
      } else {
        return null;
      }
    } else {
      throw new Error("Failed to fetch latest release tag");
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
      throw new Error("Failed to launch deploy script", { cause: e });
    }
  }
}

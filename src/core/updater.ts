import axios, { AxiosResponse } from "axios";
import { execSync } from "child_process";
import { ELogType } from "./logger";
import packageJson from "../../package.json";
export default class Updater {
  public static async checkForUpdates(): Promise<boolean> {
    const urlApi: string = packageJson.repository.url;
    const latestTagRelease: AxiosResponse<any, any> = await axios.get(
      "https://api.github.com/repos/" + urlApi.replace("git+https://github.com/", "") + "/releases/latest",
    );
    if (latestTagRelease.data["tag_name"]) {
      if (packageJson.version !== latestTagRelease.data["tag_name"]) {
        return true;
      } else {
        return false;
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

  public static async update() {
    try {
      if (process.env.NODE_ENV && process.env.NODE_ENV == "production") {
        execSync("node ../scripts/deploy.js --update", { stdio: "ignore" });
      } else {
        execSync("node ./scripts/deploy.js --update");
      }
    } catch {
      throw {
        message: "Updater failed to launch deploy script",
        type: ELogType.WARNING,
        moduleName: "Updater",
      };
    }
  }
}

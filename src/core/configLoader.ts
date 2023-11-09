import fs from "fs/promises";
import Ajv, { JTDParser } from "ajv/dist/jtd.js";
import { JTD_AppConfig, retro_JTD_AppConfig, IGlobalCfg, retro_IGlobalCfg, IInstanceCfg } from "../common/app_config_schemas.js";

export default class cfgLoader {
  private compiler: JTDParser;
  private retroCompiler: JTDParser;
  private ajv: Ajv.default;
  constructor() {
    this.ajv = new Ajv.default();
    this.compiler = this.ajv.compileParser(JTD_AppConfig);
    this.retroCompiler = this.ajv.compileParser(retro_JTD_AppConfig);
  }

  public async loadConfig(pathCfg: string): Promise<IGlobalCfg> {
    // First load from filesystem
    let rawdatas: Buffer;
    try {
      rawdatas = await fs.readFile(pathCfg);
    } catch (e) {
      throw new Error("Error when read configuration file", { cause: e });
    }

    // datas is valid
    const parsedDatas: unknown = await this.compiler(rawdatas.toString());
    if (parsedDatas) {
      return parsedDatas as IGlobalCfg;
    } else {
      if (this.compiler.message) {
        const retroParsedDatas: unknown = await this.retroCompiler(rawdatas.toString());
        if (retroParsedDatas) {
          retroParsedDatas["instanceName"] = "Unknown";
          return {
            instances: [retroParsedDatas as IInstanceCfg],
            fallback_webhook: (retroParsedDatas as retro_IGlobalCfg).fallback_webhook,
          };
        }
        const errorMsg: string = this.compiler.message;
        throw new Error("Config file is not valid", { cause: errorMsg });
      } else {
        throw new Error("Unknown error when parse config file");
      }
    }
  }
}

import fs from "fs/promises";
import Ajv, { JTDParser } from "ajv/dist/jtd.js";
import { JTD_AppConfig, retro_JTD_AppConfig, IGlobalCfg, retro_IGlobalCfg, IInstanceCfg } from "../common/app_config_schemas";
import { ELogType } from "./logger.js";
//import addFormats from "ajv-formats";

export default class cfgLoader {
  private compiler: JTDParser;
  private retroCompiler: JTDParser;
  private ajv: Ajv;
  constructor() {
    this.ajv = new Ajv();
    this.compiler = this.ajv.compileParser(JTD_AppConfig);
    this.retroCompiler = this.ajv.compileParser(retro_JTD_AppConfig);
  }

  public async loadConfig(pathCfg: string): Promise<IGlobalCfg> {
    // First load from filesystem
    let rawdatas: Buffer;
    try {
      rawdatas = await fs.readFile(pathCfg);
    } catch (e) {
      throw {
        message: "Error when read configuration file. ",
        type: ELogType.CRITIAL,
        moduleName: this.constructor.name,
        quickCode: 10,
        detail: e,
      };
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
        throw {
          message: "Error when read configuration file, JSON error",
          type: ELogType.CRITIAL,
          moduleName: this.constructor.name,
          quickCode: 11,
          detail: errorMsg,
        };
      } else {
        throw {
          message: "Unknown error when parse data",
          type: ELogType.CRITIAL,
          moduleName: this.constructor.name,
          quickCode: 12,
        };
      }
    }
  }
}

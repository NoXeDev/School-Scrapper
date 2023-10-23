import fs from "fs/promises";
import Ajv, { JTDSchemaType, JTDParser } from "ajv/dist/jtd.js";
import { ELogType } from "./logger.js";
//import addFormats from "ajv-formats";

export default class cfgLoader<inter> {
  private compiler: JTDParser;
  private ajv: Ajv;
  constructor(shematic: JTDSchemaType<inter>) {
    this.ajv = new Ajv();
    // addFormats.default(this.ajv, { mode: "fast", formats: ["uri"] });
    this.compiler = this.ajv.compileParser(shematic);
  }

  public async loadConfig(pathCfg: string): Promise<inter> {
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
      return parsedDatas as inter;
    } else {
      if (this.compiler.message) {
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

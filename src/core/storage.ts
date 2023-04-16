import fsSync from "fs";
import fs from "fs/promises";
import crypto from "crypto";

export default class Storage<I> {
  private name: string;
  public firstEntry: boolean;
  private debug: boolean;

  constructor(name: string) {
    this.name = name;
    this.firstEntry = false;

    this.debug = false;
    if (!process.env.NODE_ENV || process.env.NODE_ENV == "debug") {
      this.debug = true;
    }

    if (!fsSync.existsSync("./database/")) {
      fs.mkdir("./database/");
    }

    if (!fsSync.existsSync("./database/" + this.name + ".json")) {
      fs.writeFile("./database/" + this.name + ".json", JSON.stringify({}), "utf-8"); // Write a empty json file
      this.firstEntry = true;
    }

    if (!fsSync.existsSync("./database/metadatas.json")) {
      fs.writeFile("./database/metadatas.json", JSON.stringify({}), "utf-8"); // Write a empty json file
    }
  }

  public async save(datas: I): Promise<void> {
    const dataHash: string = crypto
      .createHash("sha256")
      .update(Buffer.from(JSON.stringify(datas)))
      .digest("hex");

    const rawMetadatas: string = await (await fs.readFile("./database/metadatas.json")).toString();
    const metadatas: object = JSON.parse(rawMetadatas);
    metadatas[this.name] = dataHash;
    await fs.writeFile("./database/metadatas.json", JSON.stringify(metadatas));

    await fs.writeFile("./database/" + this.name + ".json", JSON.stringify(datas, null, this.debug ? 2 : undefined));
  }

  public async isSame(datas: I): Promise<boolean> {
    const dataHash: string = crypto
      .createHash("sha256")
      .update(Buffer.from(JSON.stringify(datas)))
      .digest("hex");

    const DBdataHash: string = crypto
      .createHash("sha256")
      .update(Buffer.from(await fs.readFile("./database/" + this.name + ".json")))
      .digest("hex");

    if (dataHash !== DBdataHash) {
      return false;
    } else {
      return true;
    }
  }

  public async load(): Promise<I> {
    return JSON.parse(await fs.readFile("./database/" + this.name + ".json", "utf-8")) as I;
  }
}

import fsSync from "fs";
import fs from "fs/promises";
import crypto from "crypto";
import { serialize, deserialize } from "v8";
import { Mutex } from "async-mutex";

export default class Storage<I extends object> {
  private name: string;
  private firstEntry: boolean;
  private cache: I;
  private cacheHash: string;
  private static metadataMutex: Mutex = new Mutex();
  public dbMutex: Mutex = new Mutex();

  constructor(name: string) {
    this.name = name;
    this.firstEntry = false;

    if (!fsSync.existsSync("./database/")) {
      fsSync.mkdirSync("./database/");
    }

    if (!fsSync.existsSync("./database/" + this.name + ".bin")) {
      fsSync.writeFileSync("./database/" + this.name + ".bin", serialize({})); // Write a empty json file
      this.firstEntry = true;
    }

    if (!fsSync.existsSync("./database/metadatas.json")) {
      fsSync.writeFileSync("./database/metadatas.json", JSON.stringify({}), "utf-8"); // Write a empty json file
    }
  }

  public save(datas: I): void {
    const dataHash: string = crypto
      .createHash("sha256")
      .update(Buffer.from(JSON.stringify(datas)))
      .digest("hex");
    this.cache = datas;
    this.cacheHash = dataHash;

    Storage.metadataMutex.runExclusive(() => {
      fsSync.readFile("./database/metadatas.json", "utf-8", (err, rawMetadatas) => {
        const metadatas: object = JSON.parse(rawMetadatas);
        metadatas[this.name] = dataHash;

        fs.writeFile("./database/metadatas.json", JSON.stringify(metadatas));
      });
    });

    this.dbMutex.runExclusive(() => {
      fs.writeFile("./database/" + this.name + ".bin", serialize(datas)).then(() => {
        if (this.firstEntry) {
          this.firstEntry = false;
        }
      });
    });
  }

  public isSame(datas: I): boolean {
    if (!this.cache) {
      this.updateCache();
    }
    const dataHash: string = crypto
      .createHash("sha256")
      .update(Buffer.from(JSON.stringify(datas)))
      .digest("hex");
    return dataHash == this.cacheHash;
  }

  public isfirstEntry(): boolean {
    if (!this.firstEntry) {
      this.updateCache();
      return this.firstEntry;
    }
    return this.firstEntry;
  }

  private updateCache() {
    this.cache = deserialize(fsSync.readFileSync("./database/" + this.name + ".bin"));
    this.cacheHash = JSON.parse(fsSync.readFileSync("./database/metadatas.json", "utf-8"))[this.name];
    if (this.cacheHash == undefined) {
      this.firstEntry = true;
    }
  }

  public load(): I {
    if (!this.cache) {
      this.updateCache();
    }
    return this.cache;
  }
}

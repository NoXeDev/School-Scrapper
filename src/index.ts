import Bulletin from "./services/bulletin.js";
import cas2 from "./services/cas2.js";
import Sheduler from "./scheduler.js";
import cfgLoader from "./core/configLoader.js";
import { AppLogger, ELogType, RichLog } from "./core/logger.js";
import appconfig_schema, { IGlobalCfg } from "./common/app_config_schemas.js";
import storage from "./core/storage.js";
import { TRessources_Record, IBulletin_Ressource, IBulletin_Evaluation } from "./common/bulletin_interfaces.js";
import { DiscordWebHook } from "./core/request.js";
import Updater from "./core/updater.js";
import packageJson from "../package.json";

class Bot {
  public loader: cfgLoader<IGlobalCfg>;
  public cfg: IGlobalCfg;
  public AuthProvider: cas2;
  public bulletin: Bulletin;
  public shed: Sheduler;
  public DBManager: storage<TRessources_Record>;
  public discord: DiscordWebHook;
  public logger: AppLogger;

  constructor() {
    this.loader = new cfgLoader<IGlobalCfg>(appconfig_schema);
    this.shed = new Sheduler();
    this.DBManager = new storage("test");
  }

  async _run() {
    try {
      this.cfg = await this.loader.loadConfig("./config.json");
      this.AuthProvider = new cas2(this.cfg.cas2, this.cfg.credentials);
      this.bulletin = new Bulletin(this.AuthProvider);
      this.discord = new DiscordWebHook(this.cfg.webhook);
      if (this.cfg.fallback_webhook) {
        await AppLogger.setWebHookLog(this.cfg.fallback_webhook);
      }
    } catch (e) {
      console.error(e);
      process.exit(-1);
    }

    if (this.DBManager.firstEntry) {
      this.DBManager.save(await this.bulletin.getDatas());
    }

    process.on("uncaughtException", (err) => {
      if (AppLogger.isRichLog(err)) {
        AppLogger.log(err as unknown as RichLog);
      } else {
        AppLogger.log({
          message: "Uncaught global exception",
          type: ELogType.ERROR,
          moduleName: this.constructor.name,
          quickCode: -1,
          detail: err.name + " " + err.message,
        });
      }
    });

    if (process.argv.includes("update-ok")) {
      await AppLogger.log({
        message: "App was successfully updated to the version : " + packageJson.version,
        moduleName: this.constructor.name,
        type: ELogType.INFO,
        quickCode: 0,
        emote: "ℹ️",
      });
    }

    this.shed.bindAJob("Check_New_Notes", "*/5 * * * *", async () => await EachFivesMinutes(this));
    await AppLogger.log({
      message: "Service bind thought Scheduler !",
      moduleName: this.constructor.name,
      type: ELogType.INFO,
      quickCode: 0,
    });
  }
}

async function EachFivesMinutes(bot: Bot): Promise<void> {
  if (
    await Updater.checkForUpdates().catch((e) => {
      AppLogger.log(e);
    })
  ) {
    await AppLogger.log({
      message: "An update is available... Updating...",
      moduleName: "Updater",
      type: ELogType.INFO,
      emote: "ℹ️",
    });
    try {
      await Updater.update();
    } catch (e) {
      AppLogger.log(e);
    }
    return;
  }

  let notes: TRessources_Record;
  try {
    notes = await bot.bulletin.getDatas();
  } catch (e) {
    if (AppLogger.isRichLog(e)) {
      await AppLogger.log(e as RichLog);
    } else {
      await AppLogger.log(e?.toString());
    }
    return;
  }

  /*notes["R1.01"].evaluations.push({
    coef: "string",
    date: "string",
    description: "string",
    evaluation_type: 0,
    heure_debut: "string",
    heure_fin: "string",
    id: 0,
    note: {
      max: "string",
      min: "string",
      moy: "string",
      value: "string",
    },
    poids: {
      UEEE: 1,
    },
    url: "string",
  });*/

  if (!(await bot.DBManager.isSame(notes))) {
    const newNotes: (readonly [string, IBulletin_Ressource, IBulletin_Evaluation])[] = await bot.bulletin.notesCompares(
      await bot.DBManager.load(),
      notes,
    );
    for (const note of newNotes) {
      const resName: string = note[0];
      const ressource: IBulletin_Ressource = note[1];
      const newNote: IBulletin_Evaluation = note[2];
      let UEaffectation = "";
      for (const [key, value] of Object.entries(newNote.poids)) {
        if (value == 1) {
          UEaffectation += key + " ";
        }
      }
      bot.discord.post(resName, newNote, ressource, UEaffectation);
    }
    bot.DBManager.save(notes);
  }
}

// Main ASYNC WRAPPER
(async () => {
  const bot: Bot = new Bot();
  await bot._run();
})();

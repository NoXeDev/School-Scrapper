import "dotenv/config";
import Bulletin from "./services/bulletin.js";
import CAS2, { ICAS2AuthInfos } from "./services/cas2.js";
import Sheduler from "./core/scheduler.js";
import cfgLoader from "./core/configLoader.js";
import { AppLogger, ELogType, RichLog } from "./core/logger.js";
import { IGlobalCfg, IInstanceCfg, JTD_AppConfig } from "./common/app_config_schemas.js";
import storage from "./core/storage.js";
import { TRessources_Record, IBulletin_Ressource, IBulletin_Evaluation } from "./common/bulletin_interfaces.js";
import { DiscordWebHook } from "./core/request.js";
import Updater from "./core/updater.js";

enum EInstanceState {
  RUNNING,
  ERROR,
  DEAD,
}

class Core {
  public loader: cfgLoader<IGlobalCfg>;
  public shed: Sheduler;
  public instances: Map<string, Bot>;

  constructor() {
    this.loader = new cfgLoader<IGlobalCfg>(JTD_AppConfig);
    this.shed = new Sheduler();
    this.instances = new Map<string, Bot>();
    process.on("uncaughtException", (err) => {
      if (typeof err == "string") {
        AppLogger.log({
          message: "Uncaught global exception",
          type: ELogType.ERROR,
          moduleName: this.constructor.name,
          quickCode: -1,
          detail: err,
        });
      } else if (typeof err == "object") {
        if (err.name && err.message) {
          AppLogger.log({
            message: "Uncaught global exception",
            type: ELogType.ERROR,
            moduleName: this.constructor.name,
            quickCode: -1,
            detail: err.name + " " + err.message,
          });
        } else {
          AppLogger.log({
            message: "Uncaught global exception",
            type: ELogType.ERROR,
            moduleName: this.constructor.name,
            quickCode: -1,
            detail: JSON.stringify(err),
          });
        }
      }
    });
  }

  public async coreInit() {
    await Core.checkForUpdate();

    // Load config
    let cfg: IGlobalCfg;
    try {
      cfg = await this.loader.loadConfig("./config.json");
      if (cfg.fallback_webhook) {
        await AppLogger.setWebHookLog(cfg.fallback_webhook);
      }
    } catch (e) {
      AppLogger.log(e as RichLog);
      process.exit(-1);
    }

    // Init instances
    for (const instance of cfg.instances) {
      const bot: Bot = new Bot(instance);
      this.instances.set(instance.instance_name, bot);
    }

    // Auth init
    for (const instance of this.instances.values()) {
      if (!instance.authInfos) {
        try {
          instance.authInfos = await CAS2.getAuthInfos(instance.cfg.credentials);
        } catch (e) {
          AppLogger.log(e);
          if (e.quickCode == -2) {
            // Need to kill
            process.exit(-1);
          } else if (e.quickCode == 1) {
            // retryable
            instance.state = EInstanceState.ERROR; // Mark as error for the error routine
          } else if (e.quickCode == -1) {
            // instance can't be run
            instance.state = EInstanceState.DEAD;
          }
        }
      }
    }

    AppLogger.log({
      message: `Core init done with ${
        Array.from(this.instances.values()).filter((e) => e.state === EInstanceState.RUNNING).length
      }/${this.instances.size} instances running`,
      moduleName: this.constructor.name,
      type: ELogType.INFO,
      quickCode: 0,
    });

    // Shedule bind
    this.shed.bindAJob("Check_For_Update", "*/10 * * * *", async () => await Core.checkForUpdate()); // check for update
    this.shed.bindAJob("Check_New_Notes", "*/5 * * * *", async () => await Core.scrapRoutine());
  }

  public static async checkForUpdate() {
    const cfg = await Updater.checkForUpdates().catch((e) => {
      AppLogger.log(e);
    });

    if (cfg) {
      await AppLogger.log({
        message: "An update is available... Updating...",
        moduleName: "Updater",
        type: ELogType.INFO,
        emote: "ℹ️",
      });
      try {
        await Updater.update(cfg);
      } catch (e) {
        AppLogger.log(e);
      }
      return;
    }
  }

  public static async scrapRoutine() {
    // TODO
  }

  public static async errorRoutine() {
    // TODO
  }
}

class Bot {
  public cfg: IInstanceCfg;
  public DBManager: storage<TRessources_Record>;
  public sessid: string;
  public authInfos: ICAS2AuthInfos;
  public state: EInstanceState = EInstanceState.RUNNING;

  constructor(cfg: IInstanceCfg) {
    this.cfg = cfg;
    this.DBManager = new storage(cfg.instance_name);
  }
}

/*async function EachFivesMinutes(bot: Bot): Promise<void> {
  let notes: TRessources_Record;
  try {
    notes = await bot.bulletin.getDatas();
  } catch (e) {
    if (AppLogger.isRichLog(e)) {
      await AppLogger.log(e as RichLog);
    } else {
      await AppLogger.log(JSON.stringify(e));
    }
    return;
  }

  if (!(await bot.DBManager.isSame(notes))) {
    const newNotes: (readonly [string, IBulletin_Ressource, IBulletin_Evaluation])[] = await Bulletin.notesCompares(
      notes,
      await bot.DBManager.load(),
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
      DiscordWebHook.post(bot.cfg.webhook, resName, newNote, ressource, UEaffectation, bot.cfg.ping_prefix);
    }
    bot.DBManager.save(notes);
  }
}*/

// Main ASYNC WRAPPER
(async () => {
  const core: Core = new Core();
  await core.coreInit();
})();

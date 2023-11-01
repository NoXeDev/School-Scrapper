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
import { Semaphore } from "async-mutex";
import Updater from "./core/updater.js";

enum EInstanceState {
  RUNNING,
  ERROR,
  DEAD,
}

class Core {
  public static loader: cfgLoader<IGlobalCfg> = new cfgLoader<IGlobalCfg>(JTD_AppConfig);
  public static shed: Sheduler = new Sheduler();
  public static instances: Map<string, Bot> = new Map<string, Bot>();
  private static semaphore: Semaphore = new Semaphore(5);

  public static async launch() {
    if (process.env.NODE_ENV == "production") {
      await Core.checkForUpdate();
    }

    // Load config
    let cfg: IGlobalCfg;
    try {
      cfg = await this.loader.loadConfig("./config.json");
      if (cfg.fallback_webhook) {
        await AppLogger.setWebHookLog(cfg.fallback_webhook);
      }
    } catch (e) {
      e.instanceName = "Core";
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
          e.instanceName = instance.cfg.instance_name;
          AppLogger.log(e);
          if (e.quickCode == -2) {
            // Need to kill
            process.exit(-1);
          } else if (e.quickCode == 1) {
            // retryable
            instance.setState(EInstanceState.ERROR); // Mark as error for the error routine
          } else if (e.quickCode == -1) {
            // instance can't be run
            instance.setState(EInstanceState.DEAD);
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
    if (process.env.NODE_ENV == "production") {
      this.shed.bindAJob("Check_For_Update", "*/10 * * * *", async () => await Core.checkForUpdate()); // check for update
    }

    this.shed.bindAJob(
      "Check_New_Notes",
      "*/5 * * * *",
      () => Core.syncExecOnInstanceState(this.instances, EInstanceState.RUNNING, Core.asyncScrapRoutine),
      true,
    ); // check for new notes
    this.shed.bindAJob("Error_Routine", "*/15 * * * *", () =>
      Core.syncExecOnInstanceState(this.instances, EInstanceState.ERROR, Core.asyncErrorRoutine.bind(this)),
    ); // error routine
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

  public static syncExecOnInstanceState(
    instances: Map<string, Bot>,
    state: EInstanceState,
    func: (instance: Bot) => Promise<void>,
  ): void {
    for (const instance of Array.from(instances.values()).filter((e) => e.state === state)) {
      this.semaphore.runExclusive(async () => await func(instance), 1);
    }
  }

  public static async asyncScrapRoutine(instance: Bot) {
    instance.internalPrint("Starting scrap routine");
    if (!instance.sessid || !(await Bulletin.checkSessid(instance.sessid))) {
      try {
        instance.sessid = await Bulletin.doAuth(instance.authInfos);
      } catch (e) {
        e.instanceName = instance.cfg.instance_name;
        AppLogger.log(e);
        instance.setState(EInstanceState.ERROR);
        return;
      }
    }

    let notes: TRessources_Record;
    try {
      notes = await Bulletin.getDatas(instance.sessid, instance.cfg.semester_target);
    } catch (e) {
      e.instanceName = instance.cfg.instance_name;
      AppLogger.log(e);
      instance.setState(EInstanceState.ERROR);
      return;
    }

    if (instance.DBManager.firstEntry) {
      instance.DBManager.save(notes);
      return;
    }

    if (!instance.DBManager.isSame(notes)) {
      const newNotes: (readonly [string, IBulletin_Ressource, IBulletin_Evaluation])[] = await Bulletin.notesCompares(
        notes,
        instance.DBManager.load(),
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
        DiscordWebHook.post(instance.cfg.webhook, resName, newNote, ressource, UEaffectation, instance.cfg.ping_prefix).catch(
          (e) => {
            AppLogger.log(e);
          },
        );
      }
      instance.DBManager.save(notes);
    }
    instance.internalPrint("Ended scrap routine");
  }

  public static async asyncErrorRoutine(instance: Bot) {
    instance.internalPrint("Starting error routine");
    this.asyncScrapRoutine(instance).then(() => {
      instance.setState(EInstanceState.RUNNING);
      instance.internalPrint("instance revived !");
    });
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

  public internalPrint(e: any) {
    AppLogger.print(`[${this.cfg.instance_name}] - ${e}`);
  }

  public setState(state: EInstanceState) {
    this.internalPrint(`State changed to ${EInstanceState[state]}`);
    this.state = state;
  }
}

// Main ASYNC WRAPPER
(async () => {
  process.on("uncaughtException", (err) => {
    if (typeof err == "string") {
      AppLogger.log({
        message: "Uncaught global exception",
        type: ELogType.ERROR,
        moduleName: "Root",
        quickCode: -1,
        detail: err,
      });
    } else if (typeof err == "object") {
      if (err.name && err.message) {
        AppLogger.log({
          message: "Uncaught global exception",
          type: ELogType.ERROR,
          moduleName: "Root",
          quickCode: -1,
          detail: err.name + " " + err.message,
        });
      } else {
        AppLogger.log({
          message: "Uncaught global exception",
          type: ELogType.ERROR,
          moduleName: "Root",
          quickCode: -1,
          detail: JSON.stringify(err),
        });
      }
    }
  });

  if (!process.env.BULLETIN || !process.env.CAS2) {
    AppLogger.log({
      message: "Missing environment variable",
      moduleName: "Root",
      type: ELogType.CRITIAL,
      quickCode: -2, // Need to stop app
    });
    process.exit(-2);
  }

  await Core.launch(); // Main core function
})();

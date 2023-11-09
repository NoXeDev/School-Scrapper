// Libs
import { Semaphore } from "async-mutex";

// Core libs
import cfgLoader from "./configLoader.js";
import Sheduler from "./scheduler.js";
import Updater from "./updater.js";
import { DiscordWebHook } from "./request.js";
import { AppInstance, EInstanceState } from "./appInstance.js";

// Common libs
import { IGlobalCfg } from "../common/app_config_schemas.js";
import { IBulletin_Evaluation, IBulletin_Ressource, TRessources_Record } from "../common/bulletin_interfaces.js";

// Services
import CAS2 from "../services/cas2.js";
import Bulletin from "../services/bulletin.js";
import { AppLogger } from "./logger.js";

export class InstanceManager {
  public static loader: cfgLoader = new cfgLoader();
  public static shed: Sheduler = new Sheduler();
  public static instances: Map<string, AppInstance> = new Map<string, AppInstance>();
  private static semaphore: Semaphore = new Semaphore(5);

  public static async launch() {
    if (process.env.NODE_ENV == "production") {
      await this.checkForUpdate();
    }

    // Load config
    let cfg: IGlobalCfg;
    try {
      cfg = await this.loader.loadConfig("./config.json");
    } catch (e) {
      AppLogger.getLogger().fatal(e);
      process.exit(-1);
    }

    if (cfg.fallback_webhook) {
      AppLogger.setWebHook(cfg.fallback_webhook);
    }

    // Init instances
    for (const appConfig of cfg.instances) {
      const instance: AppInstance = new AppInstance(appConfig);
      this.instances.set(appConfig.instance_name, instance);
    }

    // Auth init
    for (const instance of this.instances.values()) {
      if (!instance.authInfos) {
        try {
          instance.authInfos = await CAS2.getAuthInfos(instance.cfg.credentials);
        } catch (e) {
          AppLogger.getInstanceSubLogger(instance).error("CAS2 get auth infos failed", e);
          instance.setState(EInstanceState.ERROR);
        }
      }
    }

    AppLogger.getLogger().info(
      `Core init done with ${Array.from(this.instances.values()).filter((e) => e.state === EInstanceState.RUNNING).length}/${
        this.instances.size
      } instances running`,
    );

    // Shedule bind
    if (process.env.NODE_ENV == "production") {
      this.shed.bindAJob("Check_For_Update", "*/10 * * * *", async () => await this.checkForUpdate()); // check for update
    }

    this.shed.bindAJob(
      "Check_New_Notes",
      "*/5 * * * *",
      () => this.syncExecOnInstanceState(this.instances, EInstanceState.RUNNING, this.asyncScrapRoutine),
      true,
    ); // check for new notes
    this.shed.bindAJob("Error_Routine", "*/15 * * * *", () =>
      this.syncExecOnInstanceState(this.instances, EInstanceState.ERROR, this.asyncErrorRoutine.bind(this)),
    ); // error routine
  }

  public static async checkForUpdate() {
    const cfg = await Updater.checkForUpdates().catch((e) => {
      AppLogger.getLogger().warn("Check for update failed ", e);
    });

    if (cfg) {
      AppLogger.getLogger().info(`New version available : ${cfg.newVersion}. Try updating...`);
      try {
        await Updater.update(cfg);
      } catch (e) {
        AppLogger.getLogger().warn(`${cfg.newVersion} update failed...`, e);
      }
      return;
    }
  }

  public static syncExecOnInstanceState(
    instances: Map<string, AppInstance>,
    state: EInstanceState,
    func: (instance: AppInstance) => Promise<void>,
  ): void {
    for (const instance of Array.from(instances.values()).filter((e) => e.state === state)) {
      this.semaphore.runExclusive(async () => await func(instance), 1);
    }
  }

  public static async asyncScrapRoutine(instance: AppInstance, forceAuth?: boolean) {
    if (!instance.sessid || forceAuth) {
      try {
        instance.sessid = await Bulletin.doAuth(instance.authInfos);
      } catch (e) {
        AppLogger.getInstanceSubLogger(instance).error("Bulletin auth failed", e);
        instance.setState(EInstanceState.ERROR);
        return;
      }
    }

    let notes: TRessources_Record;
    try {
      notes = await Bulletin.getDatas(instance.sessid, instance.cfg.semester_target);
    } catch (e) {
      if (e.code == "SESSID_EXPIRED" && !(await Bulletin.checkSessid(instance.sessid))) {
        return this.asyncScrapRoutine(instance, true);
      } else {
        AppLogger.getInstanceSubLogger(instance).error("Bulletin get datas failed", e);
        instance.setState(EInstanceState.ERROR);
        return;
      }
    }

    if (instance.DBManager.isfirstEntry()) {
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
            AppLogger.getInstanceSubLogger(instance).error("Discord webhook failed", e);
          },
        );
      }
      instance.DBManager.save(notes);
    }
  }

  public static async asyncErrorRoutine(instance: AppInstance) {
    this.asyncScrapRoutine(instance).then(() => {
      instance.setState(EInstanceState.RUNNING);
    });
  }
}

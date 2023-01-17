import Bulletin from "./services/bulletin.js";
import cac2 from "./services/cac2.js";
import Sheduler from "./scheduler.js";
import cfgLoader from "./core/configLoader.js";
import appconfig_schema, { IGlobalCfg } from "./common/app_config_schemas.js";
import storage from "./core/storage.js";
import { TRessources_Record, IBulletin_Ressource, IBulletin_Evaluation } from "./common/bulletin_interfaces.js";
import { DiscordWebHook } from "./core/request.js";

class Bot {
  public loader: cfgLoader<IGlobalCfg>;
  public cfg: IGlobalCfg;
  public AuthProvider: cac2;
  public bulletin: Bulletin;
  public shed: Sheduler;
  public DBManager: storage<TRessources_Record>;
  public discord: DiscordWebHook;

  constructor() {
    this.loader = new cfgLoader<IGlobalCfg>(appconfig_schema);
    this.shed = new Sheduler();
    this.DBManager = new storage("test");
  }

  async _run() {
    try {
      this.cfg = await this.loader.loadConfig("./config.json");
      this.AuthProvider = new cac2(this.cfg.cac2, this.cfg.credentials);
      this.bulletin = new Bulletin(this.AuthProvider);
      this.discord = new DiscordWebHook(this.cfg.webhook, this.cfg.fallback_webhook);
    } catch (e) {
      console.error(e);
      process.exit(-1);
    }

    if (this.DBManager.firstEntry) {
      this.DBManager.save(await this.bulletin.getDatas());
    }

    this.shed.bindAJob("Check_New_Notes", "*/5 * * * *", async () => await EachFivesMinutes(this));
    this.discord.fallbackPost("<:check:439947379831996426> [CORE] - Service bind thought Scheduler !");
  }
}

async function EachFivesMinutes(bot: Bot): Promise<void> {
  let notes: TRessources_Record;
  try {
    notes = await bot.bulletin.getDatas();
  } catch (e) {
    if (e?.message) {
      await bot.discord.fallbackPost("❌ - " + e.message);
    } else {
      await bot.discord.fallbackPost("❌ - " + e?.toString());
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

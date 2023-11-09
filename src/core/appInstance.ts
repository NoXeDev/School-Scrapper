import { IInstanceCfg } from "../common/app_config_schemas.js";
import { TRessources_Record } from "../common/bulletin_interfaces.js";
import { ICAS2AuthInfos } from "../services/cas2.js";
import storage from "./storage.js";

export enum EInstanceState {
  RUNNING,
  ERROR,
  DEAD,
}

export class AppInstance {
  public cfg: IInstanceCfg;
  public DBManager: storage<TRessources_Record>;
  public sessid: string;
  public authInfos: ICAS2AuthInfos;
  public state: EInstanceState = EInstanceState.RUNNING;

  constructor(cfg: IInstanceCfg) {
    this.cfg = cfg;
    this.DBManager = new storage(cfg.instance_name);
  }

  public setState(state: EInstanceState) {
    this.state = state;
  }
}

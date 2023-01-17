import CAC2, { ICAS2AuthInfos, ECAC2_SERVICES } from "./cas2.js";
import axios, { AxiosResponse, AxiosError, isAxiosError } from "axios";
import ajv, { ValidateFunction } from "ajv";
import { TRessources_Record, JTDBulletin, IBulletin_Ressource, IBulletin_Evaluation } from "../common/bulletin_interfaces.js";

export default class Bulletin {
  public isAuth: boolean;
  private sessid: string;
  private cac2_auth: CAC2;
  private service_url: string;
  private ajv: ajv.default;
  private dataValidator: ValidateFunction;
  constructor(AuthProvider: CAC2) {
    this.isAuth = false;
    this.cac2_auth = AuthProvider;
    this.ajv = new ajv.default();
    this.dataValidator = this.ajv.compile(JTDBulletin);
  }

  public async doAuth(): Promise<void> {
    let doAuthRes: AxiosResponse<any, any>;
    let AuthInfos: ICAS2AuthInfos;
    try {
      AuthInfos = await this.cac2_auth.getAuthInfos(ECAC2_SERVICES.BULLETIN);
      doAuthRes = await axios
        .get(AuthInfos.Auth_Service_Url, {
          maxRedirects: 0,
          validateStatus: function (status: number): boolean {
            return status == 302; // We wan't only this code, this is the only issue with a valid auth with CAC2
          },
        })
        .catch((err) => {
          if (err.response.status !== 302) {
            throw new Error("[BULLETIN] ERROR : Invalid AUTH CAC2");
          } else {
            throw new Error("[BULLETIN] ERROR : Error with request : \n" + err.message);
          }
        });
    } catch (e) {
      throw new Error("[BULLETIN] ERROR : BULLETIN service unknown error or CAC2 service error \n" + e);
    }

    this.service_url = AuthInfos.ServiceRootUrl;
    if (typeof doAuthRes.headers["set-cookie"] == "object") {
      this.sessid = doAuthRes.headers["set-cookie"][doAuthRes.headers["set-cookie"].length - 1]
        .split(";")[0]
        .replace("PHPSESSID=", "");
    } else {
      throw new Error("[BULLETIN] - Fetched datas is brokens and/or unexpected.");
    }

    if (!(await this.__checkSessID())) {
      this.sessid = "";
      throw new Error("[BULLETIN] - Invalid sessionID provided during Auth process. Please open an issue on the repo");
    }

    this.isAuth = true;
    return;
  }

  private async __checkSessID(): Promise<boolean> {
    let verifyAuthRes: AxiosResponse<any, any>;
    try {
      verifyAuthRes = await axios.get(
        this.service_url + "/services/doAuth.php?href=" + encodeURIComponent(this.service_url + "/"),
        {
          maxRedirects: 0,
          validateStatus: function (status: number): boolean {
            return status == 302; // We wan't only this http code, this is the only issue with a valid auth with CAC2
          },
          headers: { Cookie: "PHPSESSID=" + this.sessid },
        },
      );
    } catch (e) {
      if (isAxiosError(e)) {
        const castedErr = e as AxiosError;
        throw new Error("[BULLETIN] ERROR : Error with request : \n" + castedErr.message);
      } else {
        throw new Error("[BULLETIN] ERROR : BULLETIN service unknown error");
      }
    }

    if (typeof verifyAuthRes.headers["location"] == "string" && !verifyAuthRes.headers["location"].startsWith(this.service_url)) {
      return false;
    }

    return true;
  }

  public async getDatas(): Promise<TRessources_Record> {
    if (!this.isAuth) {
      try {
        await this.doAuth();
      } catch (e) {
        throw new Error(e);
      }
    }
    const postURL: string = this.service_url + "/services/data.php?q=dataPremi%C3%A8reConnexion";

    let datas: AxiosResponse<any, any> = await axios.post(postURL, null, { headers: { Cookie: "PHPSESSID=" + this.sessid } });
    if (datas.data?.redirect) {
      if (!(await this.__checkSessID())) {
        try {
          await this.doAuth();
          // retry
          datas = await axios.post(postURL, null, { headers: { Cookie: "PHPSESSID=" + this.sessid } });
        } catch (e) {
          throw new Error(e);
        }
      }
    }

    if (datas.data["relevé"] && datas.data["relevé"]["ressources"]) {
      const rawRessources: object = datas.data["relevé"]["ressources"];
      if (this.dataValidator(rawRessources)) {
        return rawRessources as TRessources_Record;
      } else {
        throw new Error("[BULLETIN] ERROR : Validator throw an error, datas is on wrong format");
      }
    } else {
      throw new Error("[BULLETIN] ERROR : Invalids datas parsed");
    }
  }

  public async notesCompares(
    notesA: TRessources_Record,
    notesB: TRessources_Record,
  ): Promise<(readonly [string, IBulletin_Ressource, IBulletin_Evaluation])[]> {
    const res: Array<readonly [string, IBulletin_Ressource, IBulletin_Evaluation]> = new Array<
      readonly [string, IBulletin_Ressource, IBulletin_Evaluation]
    >();
    for (const [key, value] of Object.entries(notesA)) {
      let arrSelector: IBulletin_Evaluation[];
      let arrOther: IBulletin_Evaluation[];
      if (value.evaluations.length !== notesB[key].evaluations.length) {
        if (value.evaluations.length > notesB[key].evaluations.length) {
          arrSelector = value.evaluations;
          arrOther = notesB[key].evaluations;
        } else {
          arrSelector = notesB[key].evaluations;
          arrOther = value.evaluations;
        }
        for (let i = 0; i < arrSelector.length; i++) {
          if (arrSelector[i]?.id === arrOther[i]?.id) {
            continue;
          } else {
            res.push([key, value, arrSelector[i]]);
          }
        }
      } else {
        continue;
      }
    }
    return res;
  }
}

import { ICAS2AuthInfos } from "./cas2.js";
import axios, { AxiosResponse } from "axios";
import ajv, { ValidateFunction } from "ajv";
import { TRessources_Record, JTDBulletin, IBulletin_Ressource, IBulletin_Evaluation } from "../common/bulletin_interfaces.js";
import { InstanceError } from "../common/errors.js";

enum ELogQuickErrCode {
  AUTH_BAD_DATAS = "AUTH_BAD_DATAS",
  AUTH_REQUEST_ERROR = "AUTH_REQUEST_ERROR",
  SESSID_EXPIRED = "SESSID_EXPIRED",
  BAD_SESSIONID = "BAD_SESSIONID",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  REQUEST_ERROR = "REQUEST_ERROR",
  BAD_BULLETIN_DATAS = "BAD_BULLETIN_DATAS",
}

export default class Bulletin {
  private static coreAjv: ajv.default = new ajv.default();
  private static dataValidator: ValidateFunction = Bulletin.coreAjv.compile(JTDBulletin);

  public static async doAuth(auth_infos: ICAS2AuthInfos): Promise<string> {
    const doAuthRes = await axios
      .get(auth_infos.Auth_Service_Url, {
        maxRedirects: 0,
        validateStatus: function (status: number): boolean {
          return status == 302; // We wan't only this code, this is the only issue with a valid auth with CAS2
        },
      })
      .catch((err) => {
        throw new InstanceError("Error with auth request", { cause: err, code: ELogQuickErrCode.AUTH_REQUEST_ERROR });
      });

    let sessid: string;
    if (typeof doAuthRes.headers["set-cookie"] == "object") {
      sessid = doAuthRes.headers["set-cookie"][doAuthRes.headers["set-cookie"].length - 1]
        .split(";")[0]
        .replace("PHPSESSID=", "");
    } else {
      throw new InstanceError("Unexpected fetched datas", { code: ELogQuickErrCode.AUTH_BAD_DATAS });
    }
    return sessid;
  }

  public static async checkSessid(sessid: string): Promise<boolean> {
    let verifyAuthRes: AxiosResponse<any, any>;
    const service_url: string = process.env.BULLETIN;
    try {
      verifyAuthRes = await axios.get(service_url + "/services/doAuth.php?href=" + encodeURIComponent(service_url + "/"), {
        maxRedirects: 0,
        validateStatus: function (status: number): boolean {
          return status == 302; // We wan't only this http code, this is the only issue with a valid auth with CAS2
        },
        headers: { Cookie: "PHPSESSID=" + sessid },
      });
    } catch (e) {
      return false;
    }

    if (typeof verifyAuthRes.headers["location"] == "string" && !verifyAuthRes.headers["location"].startsWith(service_url)) {
      return false;
    }

    return true;
  }

  public static async getDatas(sessid: string, semester_target?: number[]): Promise<TRessources_Record> {
    const postURL: string = process.env.BULLETIN + "/services/data.php?q=dataPremi%C3%A8reConnexion";

    let datas: AxiosResponse<any, any>;
    try {
      datas = await axios.post(postURL, null, { headers: { Cookie: "PHPSESSID=" + sessid } });
    } catch (e) {
      throw new InstanceError("Axios semestres fetch failed", { cause: e, code: ELogQuickErrCode.REQUEST_ERROR });
    }
    if (datas.data?.redirect) {
      throw new InstanceError("Sessid seems expired", { code: ELogQuickErrCode.SESSID_EXPIRED });
    }

    if (datas.data["relevé"]) {
      if (datas.data["semestres"] && Array.isArray(datas.data["semestres"])) {
        const resolvedReturn: TRessources_Record = {};
        for (let i = 0; i < datas.data["semestres"].length; i++) {
          if (semester_target) {
            if (!semester_target.includes(datas.data["semestres"][i]["semestre_id"])) {
              continue;
            }
          }
          const semestre: object = datas.data["semestres"][i];
          if (!semestre["formsemestre_id"]) break;
          const postURL: string =
            process.env.BULLETIN +
            "/services/data.php?q=" +
            encodeURIComponent("relevéEtudiant") +
            "&semestre=" +
            semestre["formsemestre_id"];

          const res: AxiosResponse<any, any> = await axios
            .post(postURL, null, {
              headers: { Cookie: "PHPSESSID=" + sessid },
            })
            .catch((e) => {
              throw new InstanceError("Semestres fetch failed", { cause: e, code: ELogQuickErrCode.REQUEST_ERROR });
            });

          if (
            res.data["relevé"] &&
            res.data["relevé"]["ressources"] &&
            Bulletin.dataValidator(res.data["relevé"]["ressources"]) &&
            res.data["relevé"]["saes"] &&
            Bulletin.dataValidator(res.data["relevé"]["saes"])
          ) {
            const ressources: TRessources_Record = res.data["relevé"]["ressources"] as TRessources_Record;
            const saes: TRessources_Record = res.data["relevé"]["saes"] as TRessources_Record;
            for (const e of Object.entries(ressources)) {
              e[1].semestre = res.data["relevé"]["semestre"]["numero"];
              for (let l = 0; l < e[1].evaluations.length; l++) {
                if (e[1].evaluations[l].note.moy == "~") {
                  e[1].evaluations.splice(l, 1); // If there is not avg, then ignore it
                }
              }
            }
            for (const e of Object.entries(saes)) {
              e[1].semestre = res.data["relevé"]["semestre"]["numero"];
              for (let l = 0; l < e[1].evaluations.length; l++) {
                if (e[1].evaluations[l].note.moy == "~") {
                  e[1].evaluations.splice(l, 1); // If there is not avg, then ignore it
                }
              }
            }
            Object.assign(resolvedReturn, ressources);
            Object.assign(resolvedReturn, saes);
          } else {
            throw new InstanceError("Invalids datas parsed", {
              code: ELogQuickErrCode.BAD_BULLETIN_DATAS,
              cause: new Error(JSON.stringify(Bulletin.dataValidator?.errors)),
            });
          }
        }
        return resolvedReturn;
      } else if (datas.data["relevé"]["ressources"] && datas.data["relevé"]["saes"]) {
        const rawRessources: object = datas.data["relevé"]["ressources"];
        const saes: object = datas.data["relevé"]["saes"];
        if (Bulletin.dataValidator(rawRessources) && Bulletin.dataValidator(saes)) {
          const resolvedReturn: TRessources_Record = {};
          Object.assign(resolvedReturn, rawRessources);
          Object.assign(resolvedReturn, saes);
          return resolvedReturn;
        } else {
          throw new InstanceError("Invalids datas parsed", { code: ELogQuickErrCode.BAD_BULLETIN_DATAS });
        }
      } else {
        throw new InstanceError("Semestres paring failed");
      }
    } else {
      throw new InstanceError("Bulletin is not returning required datas", {
        code: ELogQuickErrCode.BAD_BULLETIN_DATAS,
        cause: new Error(JSON.stringify(datas.data)),
      });
    }
  }

  public static async notesCompares(
    newState: TRessources_Record,
    oldState: TRessources_Record,
  ): Promise<(readonly [string, IBulletin_Ressource, IBulletin_Evaluation])[]> {
    const res: Array<readonly [string, IBulletin_Ressource, IBulletin_Evaluation]> = new Array<
      readonly [string, IBulletin_Ressource, IBulletin_Evaluation]
    >();
    for (const [key, value] of Object.entries(newState)) {
      if (value.evaluations.length !== oldState[key].evaluations.length) {
        for (let i = 0; i < value.evaluations.length; i++) {
          if (value.evaluations[i]?.id === oldState[key].evaluations[i]?.id) {
            continue;
          } else {
            res.push([key, value, value.evaluations[i]]);
          }
        }
      } else {
        continue;
      }
    }
    return res;
  }
}

import { ICAS2AuthInfos } from "./cas2.js";
import { ELogType } from "../core/logger.js";
import axios, { AxiosResponse, AxiosError, isAxiosError } from "axios";
import ajv, { ValidateFunction } from "ajv";
import { TRessources_Record, JTDBulletin, IBulletin_Ressource, IBulletin_Evaluation } from "../common/bulletin_interfaces.js";

enum ELogQuickErrCode {
  INVALID_AUTH = 1,
  SESSID_EXPIRED,
  AUTH_REQUEST_ERROR,
  SERVICE_ERROR,
  BAD_DATAS,
  BAD_SESSIONID,
  UNKNOWN_ERROR,
  REQUEST_ERROR,
}

export default class Bulletin {
  private static coreAjv: ajv = new ajv();
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
        if (err.response.status !== 302) {
          throw {
            message: "Invalid AUTH CAS2",
            moduleName: this.constructor.name + ":" + this.doAuth.name,
            type: ELogType.ERROR,
            quickCode: ELogQuickErrCode.INVALID_AUTH,
          };
        } else {
          throw {
            message: "Error with auth request",
            moduleName: this.constructor.name + ":" + this.doAuth.name,
            type: ELogType.ERROR,
            quickCode: ELogQuickErrCode.AUTH_REQUEST_ERROR,
            detail: err,
          };
        }
      });

    let sessid: string;
    if (typeof doAuthRes.headers["set-cookie"] == "object") {
      sessid = doAuthRes.headers["set-cookie"][doAuthRes.headers["set-cookie"].length - 1]
        .split(";")[0]
        .replace("PHPSESSID=", "");
    } else {
      throw {
        message: "Unexpected fetched datas",
        moduleName: this.constructor.name + ":" + this.doAuth.name,
        type: ELogType.ERROR,
        quickCode: ELogQuickErrCode.BAD_DATAS,
      };
    }

    if (!(await Bulletin.checkSessid(sessid))) {
      sessid = "";
      throw {
        message: "Invalid sessionID provided",
        moduleName: this.constructor.name + ":" + this.doAuth.name,
        type: ELogType.WARNING,
        quickCode: ELogQuickErrCode.BAD_SESSIONID,
        detail: "Please open an issue on the repo",
      };
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
      if (isAxiosError(e)) {
        const castedErr = e as AxiosError;
        throw {
          message: "Error with request",
          moduleName: this.constructor.name + ":" + this.checkSessid.name,
          type: ELogType.ERROR,
          quickCode: ELogQuickErrCode.REQUEST_ERROR,
          detail: castedErr.message,
        };
      } else {
        throw {
          message: "Service unknown error",
          moduleName: this.constructor.name + ":" + this.checkSessid.name,
          type: ELogType.ERROR,
          quickCode: ELogQuickErrCode.UNKNOWN_ERROR,
        };
      }
    }

    if (typeof verifyAuthRes.headers["location"] == "string" && !verifyAuthRes.headers["location"].startsWith(service_url)) {
      return false;
    }

    return true;
  }

  public static async getDatas(sessid: string, semester_target?: number[]): Promise<TRessources_Record> {
    if (!process.env.BULLETIN) {
      throw {
        message: "Bulletin env var not set",
        moduleName: this.constructor.name + ":" + this.getDatas.name,
        type: ELogType.CRITIAL,
      };
    }
    const postURL: string = process.env.BULLETIN + "/services/data.php?q=dataPremi%C3%A8reConnexion";

    const datas: AxiosResponse<any, any> = await axios.post(postURL, null, { headers: { Cookie: "PHPSESSID=" + sessid } });
    if (datas.data?.redirect) {
      if (!(await Bulletin.checkSessid(sessid))) {
        throw {
          message: "Sessid seems expired",
          moduleName: this.constructor.name + ":" + this.getDatas.name,
          type: ELogType.WARNING,
          quickCode: ELogQuickErrCode.SESSID_EXPIRED,
        };
      }
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
              const err: AxiosError = e as AxiosError;
              throw {
                message: "Axios error",
                moduleName: this.constructor.name + ":" + this.getDatas.name,
                type: ELogType.ERROR,
                detail: err.message,
              };
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
          throw {
            message: "Service unknown error",
            moduleName: this.constructor.name + ":" + this.getDatas.name,
            type: ELogType.ERROR,
            quickCode: ELogQuickErrCode.BAD_DATAS,
          };
        }
      } else {
        throw {
          message: "Semestres paring failed",
          moduleName: this.constructor.name + ":" + this.getDatas.name,
          type: ELogType.ERROR,
        };
      }
    } else {
      throw {
        message: "Invalids datas parsed",
        moduleName: this.constructor.name + ":" + this.getDatas.name,
        type: ELogType.ERROR,
        detail: datas.data,
      };
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

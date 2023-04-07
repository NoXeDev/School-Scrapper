import CAS2, { ICAS2AuthInfos, ECAS2_SERVICES } from "./cas2.js";
import { ELogType } from "../core/logger.js";
import axios, { AxiosResponse, AxiosError, isAxiosError } from "axios";
import ajv, { ValidateFunction } from "ajv";
import { TRessources_Record, JTDBulletin, IBulletin_Ressource, IBulletin_Evaluation } from "../common/bulletin_interfaces.js";

enum ELogQuickErrCode {
  INVALID_AUTH = 1,
  AUTH_REQUEST_ERROR,
  SERVICE_ERROR,
  BAD_DATAS,
  BAD_SESSIONID,
  UNKNOWN_ERROR,
  REQUEST_ERROR,
}

export default class Bulletin {
  public isAuth: boolean;
  private sessid: string;
  private cas2_auth: CAS2;
  private service_url: string;
  private ajv: ajv.default;
  private dataValidator: ValidateFunction;
  constructor(AuthProvider: CAS2) {
    this.isAuth = false;
    this.cas2_auth = AuthProvider;
    this.ajv = new ajv.default();
    this.dataValidator = this.ajv.compile(JTDBulletin);
  }

  public async doAuth(): Promise<void> {
    let doAuthRes: AxiosResponse<any, any>;
    let AuthInfos: ICAS2AuthInfos;
    try {
      AuthInfos = await this.cas2_auth.getAuthInfos(ECAS2_SERVICES.BULLETIN);
      doAuthRes = await axios
        .get(AuthInfos.Auth_Service_Url, {
          maxRedirects: 0,
          validateStatus: function (status: number): boolean {
            return status == 302; // We wan't only this code, this is the only issue with a valid auth with CAS2
          },
        })
        .catch((err) => {
          if (err.response.status !== 302) {
            throw {
              message: "Invalid AUTH CAS2",
              moduleName: this.constructor.name,
              type: ELogType.ERROR,
              quickCode: ELogQuickErrCode.INVALID_AUTH,
            };
          } else {
            throw {
              message: "Error with auth request",
              moduleName: this.constructor.name,
              type: ELogType.ERROR,
              quickCode: ELogQuickErrCode.AUTH_REQUEST_ERROR,
              detail: err,
            };
          }
        });
    } catch (e) {
      throw {
        message: "Service unknown error or CAS2 service error",
        moduleName: this.constructor.name,
        type: ELogType.ERROR,
        quickCode: ELogQuickErrCode.UNKNOWN_ERROR,
        detail: e,
      };
    }

    this.service_url = AuthInfos.ServiceRootUrl;
    if (typeof doAuthRes.headers["set-cookie"] == "object") {
      this.sessid = doAuthRes.headers["set-cookie"][doAuthRes.headers["set-cookie"].length - 1]
        .split(";")[0]
        .replace("PHPSESSID=", "");
    } else {
      throw {
        message: "Unexpected fetched datas",
        moduleName: this.constructor.name,
        type: ELogType.ERROR,
        quickCode: ELogQuickErrCode.BAD_DATAS,
      };
    }

    if (!(await this.__checkSessID())) {
      this.sessid = "";
      throw {
        message: "Invalid sessionID provided",
        moduleName: this.constructor.name,
        type: ELogType.WARNING,
        quickCode: ELogQuickErrCode.BAD_SESSIONID,
        detail: "Please open an issue on the repo",
      };
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
            return status == 302; // We wan't only this http code, this is the only issue with a valid auth with CAS2
          },
          headers: { Cookie: "PHPSESSID=" + this.sessid },
        },
      );
    } catch (e) {
      if (isAxiosError(e)) {
        const castedErr = e as AxiosError;
        throw {
          message: "Error with request",
          moduleName: this.constructor.name,
          type: ELogType.ERROR,
          quickCode: ELogQuickErrCode.REQUEST_ERROR,
          detail: castedErr.message,
        };
      } else {
        throw {
          message: "Service unknown error",
          moduleName: this.constructor.name,
          type: ELogType.ERROR,
          quickCode: ELogQuickErrCode.UNKNOWN_ERROR,
        };
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
        throw e;
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
          throw e;
        }
      }
    }

    if (datas.data["relevé"]) {
      if (datas.data["relevé"]["ressources"]) {
        const rawRessources: object = datas.data["relevé"]["ressources"];
        if (this.dataValidator(rawRessources)) {
          return rawRessources as TRessources_Record;
        } else {
          throw {
            message: "Service unknown error",
            moduleName: this.constructor.name,
            type: ELogType.ERROR,
            quickCode: ELogQuickErrCode.BAD_DATAS,
          };
        }
      } else {
        // This section is for, when there more than one semestre
        if (datas.data["semestres"] && Array.isArray(datas.data["semestres"])) {
          const resolvedReturn: TRessources_Record = {};
          for (let i = 0; i < datas.data["semestres"].length; i++) {
            const semestre: object = datas.data["semestres"][i];
            if (!semestre["formsemestre_id"]) break;
            const postURL: string =
              this.service_url +
              "/services/data.php?q=" +
              encodeURIComponent("relevéEtudiant") +
              "&semestre=" +
              semestre["formsemestre_id"];

            const res: AxiosResponse<any, any> = await axios
              .post(postURL, null, {
                headers: { Cookie: "PHPSESSID=" + this.sessid },
              })
              .catch((e) => {
                const err: AxiosError = e as AxiosError;
                throw {
                  message: "Axios error",
                  moduleName: this.constructor.name,
                  type: ELogType.ERROR,
                  detail: err.message,
                };
              });

            if (res.data["relevé"] && res.data["relevé"]["ressources"] && this.dataValidator(res.data["relevé"]["ressources"])) {
              const elements: TRessources_Record = res.data["relevé"]["ressources"] as TRessources_Record;
              for (const e of Object.entries(elements)) {
                e[1].semestre = i;
              }
              Object.assign(resolvedReturn, elements);
            }
          }
          return resolvedReturn;
        } else {
          throw {
            message: "Semestres paring failed",
            moduleName: this.constructor.name,
            type: ELogType.ERROR,
          };
        }
      }
    } else {
      throw {
        message: "Invalids datas parsed",
        moduleName: this.constructor.name,
        type: ELogType.ERROR,
        detail: datas.data,
      };
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

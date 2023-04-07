import axios, { AxiosResponse } from "axios";
import { HTMLElement, parse } from "node-html-parser";
import querystring from "query-string";
import { ELogType } from "../core/logger.js";

export enum ECAS2_SERVICES {
  BULLETIN,
}

export interface ICAS2AuthInfos {
  Auth_Service_Url: string;
  ServiceRootUrl: string;
}

export interface ICredentials {
  username: string;
  password: string;
}

export interface ICAS2config {
  loginPath: string;
  services: Array<string>;
}

export default class CAS2 {
  private tgc: string;
  private creds: ICredentials;
  private config: ICAS2config;

  constructor(config: ICAS2config, creds: ICredentials) {
    this.creds = creds;
    this.config = config;
  }

  public async getAuthInfos(service: ECAS2_SERVICES): Promise<ICAS2AuthInfos> {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36", // Spoof a browser
    };

    const urlCFG =
      this.config.loginPath +
      "?service=" +
      encodeURIComponent(
        this.config.services[service] + "/services/doAuth.php?href=" + encodeURIComponent(this.config.services[service] + "/"),
      );

    const executionRes: AxiosResponse<any, any> = await axios.get(urlCFG, {
      headers: { Cookie: "TGC=" + this.tgc },
      maxRedirects: 0,
      validateStatus: function (status: number): boolean {
        return status == 302 || status == 200;
      },
    });

    // This condition mean that the TGC token that we previously fetch (if so) is still valid
    if (executionRes.status == 302 && typeof executionRes.headers["location"] == "string") {
      return {
        Auth_Service_Url: executionRes.headers["location"],
        ServiceRootUrl: this.config.services[service],
      };
    }

    const rawdata: string = executionRes.data;
    const htmldata: HTMLElement = parse(rawdata);
    const execution: string = htmldata
      .querySelectorAll("#fm1")[0]
      .querySelectorAll("section")[4]
      .querySelectorAll("input[name=execution]")[0].attributes["value"];

    const loginPayload = {
      _eventId: "submit",
      execution: execution,
      username: this.creds.username,
      password: this.creds.password,
    };
    const urlencodedFormLoginPayload = querystring.stringify(loginPayload);

    const loginRes: AxiosResponse<any, any> = await axios
      .post(urlCFG, urlencodedFormLoginPayload, {
        headers: headers,
        maxRedirects: 0, // Prevent redirection (cas2 return a 302 redirect code)
        validateStatus: function (status: number): boolean {
          return status == 302; // We wan't only this code, this is the only issue with a valid auth with CAS2
        },
      })
      .catch((err) => {
        if (err.response.status == 401) {
          throw {
            message: "Invalid credentials",
            moduleName: this.constructor.name,
            type: ELogType.CRITIAL,
          };
        } else {
          throw {
            message: "Error with request",
            moduleName: this.constructor.name,
            type: ELogType.CRITIAL,
          };
        }
      });

    if (loginRes.headers["location"] && loginRes.headers["set-cookie"]) {
      const returnValue: ICAS2AuthInfos = {
        Auth_Service_Url: loginRes.headers["location"],
        ServiceRootUrl: this.config.services[service],
      };
      this.tgc = loginRes.headers["set-cookie"][0].split(";")[0].replace("TGC=", "");

      return returnValue;
    } else {
      throw {
        message: "Bad request handle",
        moduleName: this.constructor.name,
        type: ELogType.CRITIAL,
      };
    }
  }
}

import axios, { AxiosError, AxiosResponse } from "axios";
import { HTMLElement, parse } from "node-html-parser";
import { ELogType } from "../core/logger.js";

export interface ICAS2AuthInfos {
  Auth_Service_Url: string;
  ServiceRootUrl: string;
}

export interface ICredentials {
  username: string;
  password: string;
}

export default class CAS2 {
  public static async getAuthInfos(creds: ICredentials): Promise<ICAS2AuthInfos> {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36", // Spoof a browser
    };

    const urlCFG =
      process.env.CAS2 +
      "?service=" +
      encodeURIComponent(process.env.BULLETIN + "/services/doAuth.php?href=" + encodeURIComponent(process.env.BULLETIN + "/"));

    const executionRes: AxiosResponse<any, any> = await axios
      .get(urlCFG, {
        maxRedirects: 0,
        validateStatus: function (status: number): boolean {
          return status == 302 || status == 200;
        },
      })
      .catch((err) => {
        throw {
          message: "Axios failed to fetch CAS2",
          moduleName: this.constructor.name,
          type: ELogType.CRITIAL,
          detail: (err as AxiosError).message,
          quickCode: 1, // Mark as re-tryable
        };
      });

    // This condition mean that the TGC token that we previously fetch (if so) is still valid
    if (executionRes.status == 302 && typeof executionRes.headers["location"] == "string") {
      return {
        Auth_Service_Url: executionRes.headers["location"],
        ServiceRootUrl: process.env.BULLETIN,
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
      username: creds.username,
      password: creds.password,
    };
    const urlencodedFormLoginPayload = new URLSearchParams(loginPayload);

    const loginRes: AxiosResponse<any, any> = await axios
      .post(urlCFG, urlencodedFormLoginPayload.toString(), {
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
            quickCode: -1, // Mark as dead
          };
        } else {
          throw {
            message: "Error with request",
            moduleName: this.constructor.name,
            type: ELogType.CRITIAL,
            detail: (err as AxiosError).message,
            quickCode: 1, // Mark as re-tryable
          };
        }
      });

    if (loginRes.headers["location"] && loginRes.headers["set-cookie"]) {
      const returnValue: ICAS2AuthInfos = {
        Auth_Service_Url: loginRes.headers["location"],
        ServiceRootUrl: process.env.BULLETIN,
      };
      return returnValue;
    } else {
      throw {
        message: "Bad request handle",
        moduleName: this.constructor.name,
        type: ELogType.CRITIAL,
        quickCode: 1, // Mark as re-tryable
      };
    }
  }
}

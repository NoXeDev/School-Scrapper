import axios, { isAxiosError, AxiosError } from "axios";
import { IBulletin_Evaluation, IBulletin_Ressource } from "../common/bulletin_interfaces.js";
import { ELogType } from "./logger.js";
export class DiscordWebHook {
  public static async post(
    webhook_url: string,
    resName: string,
    newNote: IBulletin_Evaluation,
    ressource: IBulletin_Ressource,
    UEaffectation: string,
    ping_prefix?: string,
  ) {
    try {
      if (ping_prefix) {
        await axios.post(webhook_url, { content: ping_prefix });
      }

      await axios.post(webhook_url, {
        embeds: [
          {
            title: /(^SAE.*$)|(^P.*$)/.test(resName) ? "Nouvelle note de saé !" : "Nouvelle note !",
            color: /(^SAE.*$)|(^P.*$)/.test(resName) ? 0xc4b000 : 48770,
            thumbnail: {
              url: /(^SAE.*$)|(^P.*$)/.test(resName)
                ? "https://assets.onlinelabels.com/images/clip-art/jean_victor_balin/jean_victor_balin_icon_project.png"
                : "https://cdn3.iconfinder.com/data/icons/online-education-v-1-1/64/line_color-16-512.png",
            },
            footer: {
              text: `SchoolScrap v${process.env.VERSION} © NoXeDev`,
              icon_url: "https://avatars.githubusercontent.com/u/34164412",
            },
            fields: [
              {
                name: "Description",
                value: newNote.description,
              },
              {
                name: resName.includes("SAE") ? "Saé" : "Ressource",
                value: resName + " - " + ressource.titre,
              },
              {
                name: "Semestre",
                value: ressource.semestre != undefined ? (ressource.semestre + 1).toString() : "Le seul disponible",
              },
              {
                name: "Coef",
                value: newNote.coef,
                inline: true,
              },
              {
                name: "Note Max",
                value: newNote.note.max,
                inline: true,
              },
              {
                name: "Note Min",
                value: newNote.note.min,
                inline: true,
              },
              {
                name: "Moyenne",
                value: newNote.note.moy,
                inline: true,
              },
              {
                name: "Affectations UE",
                value: UEaffectation,
              },
            ],
          },
        ],
      });
    } catch (e) {
      if (isAxiosError(e)) {
        const castedErr = e as AxiosError;
        throw {
          message: "Error with request : \n" + castedErr.message,
          type: ELogType.ERROR,
          moduleName: "DISCORD REQUEST",
          quickCode: 20,
        };
      } else {
        throw {
          message: "core unknown error",
          type: ELogType.ERROR,
          moduleName: "DISCORD REQUEST",
          quickCode: 21,
        };
      }
    }
  }
}

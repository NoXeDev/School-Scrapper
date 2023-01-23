import axios, { isAxiosError, AxiosError } from "axios";
import { IBulletin_Evaluation, IBulletin_Ressource } from "common/bulletin_interfaces.js";
export class DiscordWebHook {
  private url: string;
  private fallbackUrl: string;
  constructor(link: string, fallbackUrl: string) {
    this.url = link;
    this.fallbackUrl = fallbackUrl;
  }

  public async post(resName: string, newNote: IBulletin_Evaluation, ressource: IBulletin_Ressource, UEaffectation: string) {
    try {
      await axios.post(this.url, {
        embeds: [
          {
            title: "Nouvelle note !",
            color: 48770,
            thumbnail: {
              url: "https://www.pinclipart.com/picdir/big/15-158087_academics-logo-youtube-png-clipart.png",
            },
            footer: {
              text: "SchoolScrap © NoXeDev",
              icon_url: "https://avatars.githubusercontent.com/u/34164412",
            },
            fields: [
              {
                name: "Description",
                value: newNote.description,
              },
              {
                name: "Semestre",
                value: ressource.semestre != undefined ? (ressource.semestre + 1).toString() : "Le seul disponible",
              },
              {
                name: "Ressource",
                value: resName + " - " + ressource.titre,
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
        throw new Error("[REQUEST] ERROR : Error with request : \n" + castedErr.message);
      } else {
        throw new Error("[REQUEST] ERROR : REQUEST core unknown error");
      }
    }
  }

  public async fallbackPost(message: string) {
    try {
      await axios.post(this.fallbackUrl, { content: message });
    } catch (e) {
      console.error(e); // bruh moment for the app
    }
  }
}

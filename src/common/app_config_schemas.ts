import { JTDSchemaType } from "ajv/dist/jtd.js";
import { ICredentials, ICAS2config } from "../services/cas2.js";

export interface IGlobalCfg {
  credentials: ICredentials;
  cas2: ICAS2config;
  webhook: string;
  fallback_webhook?: string;
}

const JTD_AppConfig: JTDSchemaType<IGlobalCfg> = {
  properties: {
    cas2: {
      properties: {
        loginPath: { type: "string" },
        services: { elements: { type: "string" } },
      },
    },
    credentials: {
      properties: {
        username: { type: "string" },
        password: { type: "string" },
      },
    },
    webhook: { type: "string" },
  },
  optionalProperties: {
    fallback_webhook: { type: "string" },
  },
};

export default JTD_AppConfig;

import { JTDSchemaType } from "ajv/dist/jtd.js";
import { ICredentials, ICAC2config } from "services/cac2.js";

export interface IGlobalCfg {
  credentials: ICredentials;
  cac2: ICAC2config;
  webhook: string;
  fallback_webhook: string;
}

const JTD_AppConfig: JTDSchemaType<IGlobalCfg> = {
  properties: {
    cac2: {
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
    fallback_webhook: { type: "string" },
  },
};

export default JTD_AppConfig;

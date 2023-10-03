import { JTDSchemaType } from "ajv/dist/jtd.js";
import { ICredentials } from "../services/cas2.js";

export interface IGlobalCfg {
  credentials: ICredentials;
  webhook: string;
  fallback_webhook?: string;
  ping_prefix?: string;
  semester_target?: number[];
}

const JTD_AppConfig: JTDSchemaType<IGlobalCfg> = {
  properties: {
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
    ping_prefix: { type: "string" },
    semester_target: {
      elements: {
        type: "int8",
      },
    },
  },
  additionalProperties: true, // retrocompatibility
};

export default JTD_AppConfig;

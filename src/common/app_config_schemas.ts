import { JTDSchemaType } from "ajv/dist/jtd.js";
import { ICredentials } from "../services/cas2.js";

export interface IInstanceCfg {
  instance_name: string;
  credentials: ICredentials;
  webhook: string;
  ping_prefix?: string;
  semester_target?: number[];
}

export interface IGlobalCfg {
  instances: IInstanceCfg[];
  fallback_webhook?: string;
}

// retrocompatibility interface
export interface retro_IGlobalCfg {
  credentials: ICredentials;
  webhook: string;
  fallback_webhook?: string;
  ping_prefix?: string;
  semester_target?: number[];
}

// retrocompatibility schema
const retro_JTD_AppConfig: JTDSchemaType<retro_IGlobalCfg> = {
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

const JTD_AppConfig: JTDSchemaType<IGlobalCfg> = {
  properties: {
    instances: {
      elements: {
        properties: {
          credentials: {
            properties: {
              username: { type: "string" },
              password: { type: "string" },
            },
          },
          webhook: { type: "string" },
          instance_name: { type: "string" },
        },
        optionalProperties: {
          ping_prefix: { type: "string" },
          semester_target: {
            elements: {
              type: "int8",
            },
          },
        },
        additionalProperties: true, // retrocompatibility
      },
    },
  },
  optionalProperties: {
    fallback_webhook: { type: "string" },
  },
  additionalProperties: true, // retrocompatibility
};

export { JTD_AppConfig, retro_JTD_AppConfig };

import { JSONSchemaType } from "ajv";

export type TRessources_Record = Record<string, IBulletin_Ressource>;

export interface IBulletin_Evaluation {
  coef: string;
  description?: string;
  evaluation_type: number;
  id: number;
  note: {
    max: string;
    min: string;
    moy: string;
    value: string;
  };
  poids: Record<string, number>;
  url: string;
}

export interface IBulletin_Ressource {
  code_apogee?: string;
  evaluations: Array<IBulletin_Evaluation>;
  id: number;
  titre: string;
  url: string;
  semestre?: number;
}

const JTDBulletin: JSONSchemaType<TRessources_Record> = {
  type: "object",
  propertyNames: { type: "string" },
  patternProperties: {
    "(^R.*$)|(^SAE.*$)|(^P.*$)": {
      type: "object",
      properties: {
        code_apogee: { type: "string", nullable: true },
        evaluations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              coef: { type: "string" },
              description: { type: "string", nullable: true },
              evaluation_type: { type: "number" },
              id: { type: "number" },
              note: {
                type: "object",
                properties: {
                  max: { type: "string" },
                  min: { type: "string" },
                  moy: { type: "string" },
                  value: { type: "string" },
                },
                required: ["max", "min", "moy", "value"],
              },
              poids: {
                type: "object",
                propertyNames: { type: "string" },
                required: [],
              },
              url: { type: "string" },
            },
            required: ["coef", "evaluation_type", "id", "note", "poids", "url"],
          },
        },
        id: { type: "integer" },
        titre: { type: "string" },
        url: { type: "string" },
        semestre: { type: "number", nullable: true },
      },
      required: ["evaluations", "id", "titre", "url"],
    },
  },
  additionalProperties: false,
  required: [],
};

export { JTDBulletin };

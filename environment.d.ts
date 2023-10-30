declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CAS2: string;
      BULLETIN: string;
      VERSION: string;
      URL: string;
    }
  }
}

export {};

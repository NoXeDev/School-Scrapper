declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CAS2: string;
      BULLETIN: string;
    }
  }
}

export {};

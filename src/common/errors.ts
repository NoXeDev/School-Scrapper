export class InstanceError extends Error {
  public instanceName?: string;
  public code?: string;
  public stateFlag?: number;
  constructor(message: string, options?: ErrorOptions & { code?: string; instanceName?: string; stateFlag?: number }) {
    super(message, options);
    this.instanceName = options?.instanceName;
    this.code = options?.code;
    this.stateFlag = options?.stateFlag;
  }
}

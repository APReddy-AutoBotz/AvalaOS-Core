import type { PilotOperationsCommand, PilotOperationsProjection, PilotOperationsTransport } from './contracts';

export class PilotOperationsClient {
  constructor(private readonly transport: PilotOperationsTransport) {}
  command(input:PilotOperationsCommand):Promise<unknown>{ return this.transport.command(input); }
  async projection(input:{organizationId:string;workspaceId:string;expectedAuthorizationVersion:number}):Promise<PilotOperationsProjection>{
    const result=await this.transport.query(input);
    if(!result||typeof result!=='object'||Array.isArray(result)||(result as {liveActivationAuthorized?:unknown}).liveActivationAuthorized!==false) throw new Error('PILOT_OPERATIONS_PROJECTION_INVALID');
    return result as PilotOperationsProjection;
  }
}

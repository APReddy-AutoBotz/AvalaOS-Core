import { handleOptions } from '../_shared/http.ts';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
const response=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','vary':'authorization'}});
Deno.serve(request=>{
  const options=handleOptions(request);if(options)return options;
  // Never return static/demo claims from a production query boundary. Fresh authority/database wiring is deferred to the post-#221 shared integration.
  if(request.method!=='GET'||Deno.env.get('TRUST_ASSURANCE_ENABLED')!=='true')return response({code:'TRUST_ASSURANCE_UNAVAILABLE',message:'The requested resource is unavailable.'},404);
  return response({code:'TRUST_ASSURANCE_UNAVAILABLE',message:'The requested resource is unavailable.'},503);
});

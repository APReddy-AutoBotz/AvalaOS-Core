import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';

import {pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {chromium} from '@playwright/test';
const root=process.cwd();
const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
const {AuthenticatedHostedBrowserActionTracker}=await load('scripts/authenticatedHostedBrowserRequestClassifier.mjs');
const {AuthenticatedHostedController}=await load('scripts/authenticatedHostedController.mjs');
const {createAuthenticatedHostedObservationReader}=await load('scripts/authenticatedHostedObservationAdapter.mjs');
const compile=(source,require)=>{
  const out={};
  new Function('exports','require',ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText)(out,require);return out;
};
const network=compile(readFileSync('tests/browser/authenticatedHostedNetwork.ts','utf8'),
  ()=>({AuthenticatedHostedBrowserActionTracker}));
const harness=readFileSync('tests/browser/authenticatedLifecycleHarness.ts','utf8');
const queueFactory=compile(harness.slice(harness.indexOf('export const createAuthenticatedLifecycleWorkQueue'),
  harness.indexOf('const reportIdentityDiagnostic')),()=>assert.fail()).createAuthenticatedLifecycleWorkQueue;
import { legacyAuthenticatedObservationQuery as baselineSql } from './authenticatedObservationQueryProof.mjs';
export async function runObserverBrowserProof({db,config,adapter,project,ids}){
  const server=createServer((req,res)=>{
    res.setHeader('access-control-allow-origin','*');
    res.setHeader('access-control-allow-headers','authorization,content-type');
    res.setHeader('content-type',req.url==='/'?'text/html':'application/json');
    res.end(req.url==='/'?'<title>Local observation boundary proof</title>':'{"ok":true}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  const results=[];
  try{
    browser=await chromium.launch({headless:true});
    for(const variant of ['baseline','corrected']){
      let queryMs=0,queryCount=0,verifiedSessions=0,pending=0;
      const active=new Set();
      const reader=createAuthenticatedHostedObservationReader({config,db:{query:async(sql,params)=>{
        const start=performance.now();
        try{return await db.query(variant==='baseline'&&sql.includes('UNION ALL')?baselineSql:sql,params);}
        finally{queryMs+=performance.now()-start;queryCount++;}
      }}});
      const controller=new AuthenticatedHostedController({config,adapter:{...adapter,observe:input=>reader.capture(input)},
        identity:{verifySession:async({actorId,sessionId})=>{
          verifiedSessions++;
          const result=await db.query('SELECT user_id,id FROM auth.sessions WHERE user_id=$1 AND id=$2',[actorId,sessionId]);
          return result.rows[0]?{actorId:result.rows[0].user_id,sessionId:result.rows[0].id}:null;
        }}});
      controller.active=true;controller.exerciseId=ids.exercise;
      controller.projects.set('desktop-chromium',{...project,lastBoundaryAt:new Date().toISOString()});
      const tracker=new AuthenticatedHostedBrowserActionTracker({appOrigin:'http://127.0.0.1:1',backendOrigin:origin,
        startAction:async input=>{pending++;try{
          const result=await controller.beginBrowserAction({projectName:'desktop-chromium',...input});
          active.add(result.actionId);return result;
        }finally{pending--;}},
        finishAction:async input=>{await controller.finishBrowserAction({projectName:'desktop-chromium',...input});active.delete(input.actionId);}});
      const context=await browser.newContext();
      const page=await context.newPage();
      const queue=queueFactory();
      const lifecycle=await network.installAuthenticatedHostedNetwork({context,hosted:true,allowedOrigins:new Set([origin]),
        tracker,queueNetworkAction:queue.enqueue,onExternalRequest:()=>assert.fail(),onHttpRequest:()=>{},
        onTrackerError:error=>queue.enqueue(async()=>{throw error;})});
      try{
        await page.goto(origin);
        const token='header.'+Buffer.from(JSON.stringify({sub:ids.actors.author,session_id:ids.sessions.author})).toString('base64url')+'.signature-padding-that-keeps-the-token-bounded';
        const fetches=page.evaluate(async token=>Promise.all(Array.from({length:2},()=>fetch('/functions/v1/tenant-session',
          {headers:{authorization:'Bearer '+token}}).then(async r=>({status:r.status,body:await r.json()})))),token);
        void fetches.catch(()=>{}); // Preserve rejection for the awaited result; own it during cleanup too.
        const admissionDeadline=performance.now()+10_000;
        while(pending<2){
          assert.ok(performance.now()<admissionDeadline,'two local action admissions must start');
          await new Promise(resolve=>setTimeout(resolve,5));
        }
        const start=performance.now();let failure=null;
        try{await network.authenticatedLifecycleSettleActorNavigationBoundary({
          settleActionAdmissions:lifecycle.settleActionAdmissions,settleResponseBodies:lifecycle.settleResponseBodies,
          drainNetworkActions:queue.drain,activeActionCount:()=>pending+active.size,
        });}catch(error){failure=error.message;}
        const elapsedMs=performance.now()-start;
        assert.deepEqual(await fetches,[{status:200,body:{ok:true}},{status:200,body:{ok:true}}]);
        await lifecycle.settleActionAdmissions();await lifecycle.settleResponseBodies();await queue.drain();
        const actions=controller.browserActions.get('desktop-chromium');
        assert.equal(actions.length,2);assert.equal(actions.filter(x=>x.complete).length,2);
        assert.equal(pending+active.size,0);assert.equal(verifiedSessions,2);
        if(variant==='baseline')assert.equal(failure,'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE');
        else {assert.equal(failure,null);assert.ok(elapsedMs<15000);}
        results.push({variant,elapsedMs,queryMs,queryCount,verifiedSessions,completedActions:actions.length,
          outstanding:pending+active.size,failure,frames:actions.map(a=>({before:a.before.records.length,after:a.after.records.length}))});
      }finally{await context.close();await controller.stopControlIntakeAndJoin();}
    }
  }finally{
    try{await browser?.close();}
    finally{await new Promise(resolve=>server.close(resolve));}
  }
  return {kind:'local-postgres-chromium-controller-observation-comparison',documents:24,bytesPerDocument:12000000,
    injectedLatency:false,deadlineMs:15000,results};
}

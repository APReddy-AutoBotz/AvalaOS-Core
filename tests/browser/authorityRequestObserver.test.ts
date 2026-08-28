import assert from 'node:assert/strict';
import {createAuthorityRequestObserver} from './authorityRequestObserver';

type Request={category:string;marker:string};
type WebSocket={category:string;marker:string};
const listeners=new Set<(request:Request)=>void>();
const webSocketListeners=new Set<(socket:unknown)=>void>();
const page={
  on:(_event:'request',listener:(request:Request)=>void)=>listeners.add(listener),
  off:(_event:'request',listener:(request:Request)=>void)=>listeners.delete(listener),
};
const emit=(request:Request)=>listeners.forEach(listener=>listener(request));
const webSocketPage={
  on:(_event:'websocket',listener:(socket:unknown)=>void)=>webSocketListeners.add(listener),
  off:(_event:'websocket',listener:(socket:unknown)=>void)=>webSocketListeners.delete(listener),
};
const emitWebSocket=(socket:WebSocket)=>webSocketListeners.forEach(listener=>listener(socket));
let now=0;
const scheduled:Array<{at:number;request?:Request;socket?:WebSocket}>=[];
const wait=async(milliseconds:number)=>{
  const target=now+milliseconds;
  while(scheduled.length&&scheduled[0].at<=target){
    const event=scheduled.shift()!;
    now=event.at;
    if(event.request)emit(event.request);
    if(event.socket)emitWebSocket(event.socket);
  }
  now=target;
};
const observer=createAuthorityRequestObserver({
  page,
  classify:request=>request.category==='safe'?null:request.category,
  sample:(request,category)=>({category,marker:request.marker}),
  webSocket:{
    page:webSocketPage,
    classify:socket=>(socket as WebSocket).category==='safe'?null:(socket as WebSocket).category,
    sample:(socket,category)=>({category,marker:(socket as WebSocket).marker}),
  },
  maxSamples:2,
  now:()=>now,
  wait,
});
emit({category:'safe',marker:'post-entry'});
const run=async()=>{
  now=1_000;
  scheduled.push(
    {at:1_010,request:{category:'safe',marker:'late-safe-resource'}},
    {at:1_024,request:{category:'authority-request',marker:'post-sign-out-provider-traffic'}},
    {at:1_040,socket:{category:'unexpected-websocket',marker:'post-sign-out-websocket'}},
  );
  await observer.stopAfterQuiescence({quietPeriodMs:25,timeoutMs:100});
  assert.equal(now,1_065,'the post-sign-out window must start at the quiescence call and every late transport event must restart it');
  assert.deepEqual(observer.snapshot(),{totalViolations:2,samples:[
    {category:'authority-request',marker:'post-sign-out-provider-traffic'},
    {category:'unexpected-websocket',marker:'post-sign-out-websocket'},
  ]},'HTTP and WebSocket provider traffic after sign-out must remain inside the shared observer window');
  emit({category:'authority-request',marker:'after-explicit-stop'});
  emitWebSocket({category:'unexpected-websocket',marker:'websocket-after-explicit-stop'});
  assert.equal(observer.snapshot().totalViolations,2,'the observer may stop all transport listeners only after deterministic quiescence');
  await assert.rejects(
    observer.stopAfterQuiescence({quietPeriodMs:25,timeoutMs:100}),
    /already stopped/u,
    'a stopped observer must fail closed rather than imply a second observation window',
  );
  console.log('authority request observer: late post-sign-out HTTP and WebSocket traffic reset quiescence and remain observable');
};
run().catch(error=>{console.error(error);process.exitCode=1;});

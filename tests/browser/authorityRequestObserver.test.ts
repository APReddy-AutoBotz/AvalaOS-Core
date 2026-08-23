import assert from 'node:assert/strict';
import {createAuthorityRequestObserver} from './authorityRequestObserver';

type Request={category:string;marker:string};
const listeners=new Set<(request:Request)=>void>();
const page={
  on:(_event:'request',listener:(request:Request)=>void)=>listeners.add(listener),
  off:(_event:'request',listener:(request:Request)=>void)=>listeners.delete(listener),
};
const emit=(request:Request)=>listeners.forEach(listener=>listener(request));
let now=0;
const scheduled:{at:number;request:Request}[]=[];
const wait=async(milliseconds:number)=>{
  const target=now+milliseconds;
  while(scheduled.length&&scheduled[0].at<=target){
    const event=scheduled.shift()!;
    now=event.at;
    emit(event.request);
  }
  now=target;
};
const observer=createAuthorityRequestObserver({
  page,
  classify:request=>request.category==='safe'?null:request.category,
  sample:(request,category)=>({category,marker:request.marker}),
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
  );
  await observer.stopAfterQuiescence({quietPeriodMs:25,timeoutMs:100});
  assert.equal(now,1_049,'the post-sign-out window must start at the quiescence call and every late request must restart it');
  assert.deepEqual(observer.snapshot(),{totalViolations:1,samples:[{category:'authority-request',marker:'post-sign-out-provider-traffic'}]},'provider traffic after sign-out must remain inside the observer window');
  emit({category:'authority-request',marker:'after-explicit-stop'});
  assert.equal(observer.snapshot().totalViolations,1,'the observer may stop only after deterministic quiescence');
  await assert.rejects(
    observer.stopAfterQuiescence({quietPeriodMs:25,timeoutMs:100}),
    /already stopped/u,
    'a stopped observer must fail closed rather than imply a second observation window',
  );
  console.log('authority request observer: late post-sign-out traffic resets quiescence and remains observable');
};
run().catch(error=>{console.error(error);process.exitCode=1;});

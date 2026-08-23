import assert from 'node:assert/strict';
import {createAuthorityRequestObserver} from './authorityRequestObserver';

type Request={category:string;marker:string};
const listeners=new Set<(request:Request)=>void>();
const page={
  on:(_event:'request',listener:(request:Request)=>void)=>listeners.add(listener),
  off:(_event:'request',listener:(request:Request)=>void)=>listeners.delete(listener),
};
const emit=(request:Request)=>listeners.forEach(listener=>listener(request));
const observer=createAuthorityRequestObserver({
  page,
  classify:request=>request.category==='safe'?null:request.category,
  sample:(request,category)=>({category,marker:request.marker}),
  maxSamples:2,
});
emit({category:'safe',marker:'post-entry'});
emit({category:'authority-request',marker:'post-sign-out-provider-traffic'});
assert.deepEqual(observer.snapshot(),{totalViolations:1,samples:[{category:'authority-request',marker:'post-sign-out-provider-traffic'}]},'provider traffic after sign-out must remain inside the observer window');
observer.stop();
emit({category:'authority-request',marker:'after-explicit-stop'});
assert.equal(observer.snapshot().totalViolations,1,'explicit stop must be the only observer boundary');
console.log('authority request observer: post-entry and post-sign-out adversarial traffic remains observable');

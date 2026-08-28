export type AuthorityRequestObservation<TSample> = {totalViolations:number;samples:TSample[]};

type QuiescenceOptions = {
  quietPeriodMs:number;
  timeoutMs:number;
};

export const createAuthorityRequestObserver = <TRequest, TSample>({
  page,
  classify,
  sample,
  webSocket,
  maxSamples,
  now=()=>Date.now(),
  wait=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds)),
}:{
  page:{on:(event:'request',listener:(request:TRequest)=>void)=>unknown;off:(event:'request',listener:(request:TRequest)=>void)=>unknown};
  classify:(request:TRequest)=>string|null;
  sample:(request:TRequest,category:string)=>TSample;
  webSocket?:{
    page:{on:(event:'websocket',listener:(socket:unknown)=>void)=>unknown;off:(event:'websocket',listener:(socket:unknown)=>void)=>unknown};
    classify:(socket:unknown)=>string|null;
    sample:(socket:unknown,category:string)=>TSample;
  };
  maxSamples:number;
  now?:()=>number;
  wait?:(milliseconds:number)=>Promise<void>;
}) => {
  const samples:TSample[]=[];
  let totalViolations=0;
  let requestSequence=0;
  let lastRequestAt=now();
  let stopped=false;
  const inspect=(request:TRequest)=>{
    requestSequence+=1;
    lastRequestAt=now();
    const category=classify(request);
    if(!category)return;
    totalViolations+=1;
    if(samples.length<maxSamples)samples.push(sample(request,category));
  };
  const inspectWebSocket=(socket:unknown)=>{
    requestSequence+=1;
    lastRequestAt=now();
    const category=webSocket?.classify(socket)??null;
    if(!category)return;
    totalViolations+=1;
    if(samples.length<maxSamples)samples.push(webSocket!.sample(socket,category));
  };
  page.on('request',inspect);
  webSocket?.page.on('websocket',inspectWebSocket);
  const stop=()=>{
    if(stopped)return;
    stopped=true;
    page.off('request',inspect);
    webSocket?.page.off('websocket',inspectWebSocket);
  };
  const stopAfterQuiescence=async({quietPeriodMs,timeoutMs}:QuiescenceOptions)=>{
    if(!Number.isFinite(quietPeriodMs)||quietPeriodMs<=0)throw new Error('quietPeriodMs must be a positive finite number');
    if(!Number.isFinite(timeoutMs)||timeoutMs<quietPeriodMs)throw new Error('timeoutMs must be finite and cover the quiet period');
    if(stopped)throw new Error('request observer is already stopped');
    const startedAt=now();
    // Quiescence is explicitly post-workflow. A quiet period before sign-out
    // cannot satisfy or shorten the required observation window.
    lastRequestAt=Math.max(lastRequestAt,startedAt);
    while(true){
      const elapsed=now()-startedAt;
      if(elapsed>=timeoutMs)throw new Error(`request observer did not reach ${quietPeriodMs}ms quiescence within ${timeoutMs}ms`);
      const sequenceBeforeWait=requestSequence;
      const quietFor=now()-lastRequestAt;
      if(quietFor<quietPeriodMs){
        await wait(Math.min(quietPeriodMs-quietFor,timeoutMs-elapsed));
        continue;
      }
      if(sequenceBeforeWait!==requestSequence)continue;
      // The final quiet-window check and listener removal are synchronous. A
      // queued late request therefore cannot interleave with the stop edge.
      stop();
      return;
    }
  };
  return {
    snapshot:():AuthorityRequestObservation<TSample>=>({totalViolations,samples:[...samples]}),
    stopAfterQuiescence,
  };
};

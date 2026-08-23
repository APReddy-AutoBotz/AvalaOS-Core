export type AuthorityRequestObservation<TSample> = {totalViolations:number;samples:TSample[]};

export const createAuthorityRequestObserver = <TRequest, TSample>({
  page,
  classify,
  sample,
  maxSamples,
}:{
  page:{on:(event:'request',listener:(request:TRequest)=>void)=>unknown;off:(event:'request',listener:(request:TRequest)=>void)=>unknown};
  classify:(request:TRequest)=>string|null;
  sample:(request:TRequest,category:string)=>TSample;
  maxSamples:number;
}) => {
  const samples:TSample[]=[];
  let totalViolations=0;
  const inspect=(request:TRequest)=>{
    const category=classify(request);
    if(!category)return;
    totalViolations+=1;
    if(samples.length<maxSamples)samples.push(sample(request,category));
  };
  page.on('request',inspect);
  return {
    snapshot:():AuthorityRequestObservation<TSample>=>({totalViolations,samples:[...samples]}),
    stop:()=>page.off('request',inspect),
  };
};

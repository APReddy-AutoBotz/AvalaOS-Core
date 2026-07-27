import { callGeminiText, callGroqJson } from './ai.ts';
import type { JsonObject } from './studioArtifactCommand.ts';

const parse=(raw:string):JsonObject=>{const value:unknown=JSON.parse(raw);if(typeof value!=='object'||value===null||Array.isArray(value))throw new Error('Provider output was not an object.');return value as JsonObject;};
export const callStudioArtifactProvider=async(input:{apiKey:string;provider:'gemini'|'groq';sourcePackage:JsonObject;template:string;artifactType:'brd'|'frd'|'pdd'})=>{
 const source=JSON.stringify(input.sourcePackage);if(source.length>800_000)throw new Error('Source package exceeds provider boundary.');
 // Both instruction and source are selected from immutable server records. No browser prompt is accepted.
 const prompt=`Artifact type: ${input.artifactType}\nImmutable source package JSON:\n${source}\nReturn only the JSON object required by the system instruction.`;
 const result=input.provider==='groq'?await callGroqJson(input.apiKey,prompt,input.template):await callGeminiText(input.apiKey,prompt,input.template);
 return{content:parse(result.content)};
};

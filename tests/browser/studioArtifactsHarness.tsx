import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../index.css';
import StudioArtifactWorkspace from '../../components/docs/StudioArtifactWorkspace';
import DocsView from '../../components/docs/DocsView';
import {AuthProvider,useAuth} from '../../components/auth/AuthProvider';
import {OrganizationProvider,useOrganizationContext} from '../../components/auth/OrganizationProvider';
import {supabase} from '../../services/supabaseClient';

const ORG='11111111-1111-4111-8111-111111111111',WS='22222222-2222-4222-8222-222222222222',ACTOR='66666666-6666-4666-8666-666666666666';
const applicationRoute=new URLSearchParams(location.search).has('application-route');

const encode=(value:object)=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const establishApplicationSession=async()=>{
  const access_token=`${encode({alg:'none',typ:'JWT'})}.${encode({sub:ACTOR,aud:'authenticated',role:'authenticated',email:'author@example.test',exp:4102444800})}.test-signature`;
  const {error}=await supabase.auth.setSession({access_token,refresh_token:'studio-browser-refresh-token'});
  if(error)throw error;
};

function ApplicationRoute(){
  const {user,loading}=useAuth();
  const {tenantContext,sessionState}=useOrganizationContext();
  return <main className="min-h-screen p-4">
    <output data-testid="studio-auth-human">{loading?'loading':user?.id??'anonymous'}</output>
    <output data-testid="studio-server-tenant">{sessionState}:{tenantContext?.organizationId??'none'}:{tenantContext?.workspaceId??'none'}</output>
    <DocsView generations={[]} templates={[]} onViewGeneration={()=>undefined}/>
  </main>;
}

if(applicationRoute)await establishApplicationSession();
createRoot(document.getElementById('root')!).render(applicationRoute
  ? <AuthProvider><OrganizationProvider><ApplicationRoute/></OrganizationProvider></AuthProvider>
  : <main className="min-h-screen p-4"><StudioArtifactWorkspace context={{organizationId:ORG,workspaceId:WS,authorizationVersion:7} as any} capabilities={['studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve']} online={!new URLSearchParams(location.search).has('offline')}/></main>);

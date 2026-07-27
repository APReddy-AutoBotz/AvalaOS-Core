import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../index.css';
import StudioArtifactWorkspace from '../../components/docs/StudioArtifactWorkspace';
import DocsView from '../../components/docs/DocsView';
import {AuthProvider} from '../../components/auth/AuthProvider';
import {OrganizationProvider} from '../../components/auth/OrganizationProvider';

const ORG='11111111-1111-4111-8111-111111111111',WS='22222222-2222-4222-8222-222222222222';
const applicationRoute=new URLSearchParams(location.search).has('application-route');
createRoot(document.getElementById('root')!).render(applicationRoute
  ? <AuthProvider><OrganizationProvider><main className="min-h-screen p-4"><DocsView generations={[]} templates={[]} onViewGeneration={()=>undefined}/></main></OrganizationProvider></AuthProvider>
  : <main className="min-h-screen p-4"><StudioArtifactWorkspace context={{organizationId:ORG,workspaceId:WS,authorizationVersion:7} as any} capabilities={['studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve']} online={!new URLSearchParams(location.search).has('offline')}/></main>);

/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_AVALA_AI_MODE?: string
    readonly VITE_AI_EDGE_FUNCTIONS_ENABLED?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

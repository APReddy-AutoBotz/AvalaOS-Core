/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_AVALA_RUNTIME_MODE?: string
    readonly VITE_AVALA_AUTOMATED_TEST_CONTEXT?: string
    readonly VITE_AI_EDGE_FUNCTIONS_ENABLED?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

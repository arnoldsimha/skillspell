/// <reference types="vite/client" />

/**
 * Global constants injected by Vite's `define` config.
 *
 * In development: __BACKEND_URL__ is the full backend URL (e.g. "http://api.skillspell.localhost:1355")
 * In production: __BACKEND_URL__ is empty string (app uses relative "/api" paths)
 */
declare const __BACKEND_URL__: string;

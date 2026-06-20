/**
 * The app-wide API client — THE swap point between mock and real backend.
 *
 * Set NEXT_PUBLIC_API_URL (e.g. http://localhost:8000) to use the FastAPI
 * backend; leave it unset for the self-contained mock (localStorage + synth).
 * Pages import `api` from here and never know which one they got.
 */
import { BetaApi } from "./types";
import { api as mockApi } from "./mockApi";
import { RealBetaApi } from "./realApi";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

export const api: BetaApi = baseUrl ? new RealBetaApi(baseUrl) : mockApi;

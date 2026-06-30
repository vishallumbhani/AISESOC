/**
 * lib/api.ts
 *
 * Default export = orgApi.
 * This is what all existing org pages import as:  import api from "../lib/api"
 * It reads organization_access_token ONLY.
 *
 * Platform pages must import platformApi directly:
 *   import platformApi from "../lib/platformApi"
 */
export { default } from "./orgApi";

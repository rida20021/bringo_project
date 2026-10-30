/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as collections from "../collections.js";
import type * as crons from "../crons.js";
import type * as deposits from "../deposits.js";
import type * as email_import from "../email/import.js";
import type * as evidence from "../evidence.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as index from "../index.js";
import type * as lib_auth from "../lib/auth.js";
import type * as markets from "../markets.js";
import type * as orders from "../orders.js";
import type * as reconciliation from "../reconciliation.js";
import type * as riders from "../riders.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  collections: typeof collections;
  crons: typeof crons;
  deposits: typeof deposits;
  "email/import": typeof email_import;
  evidence: typeof evidence;
  http: typeof http;
  imports: typeof imports;
  index: typeof index;
  "lib/auth": typeof lib_auth;
  markets: typeof markets;
  orders: typeof orders;
  reconciliation: typeof reconciliation;
  riders: typeof riders;
  settings: typeof settings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

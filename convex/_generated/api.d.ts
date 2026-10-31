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
import type * as discrepancies from "../discrepancies.js";
import type * as email_import from "../email/import.js";
import type * as evidence from "../evidence.js";
import type * as excelImport from "../excelImport.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as index from "../index.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_provisioning from "../lib/provisioning.js";
import type * as lib_tiktakParser from "../lib/tiktakParser.js";
import type * as lib_tiktakValues from "../lib/tiktakValues.js";
import type * as markets from "../markets.js";
import type * as orders from "../orders.js";
import type * as receipts from "../receipts.js";
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
  discrepancies: typeof discrepancies;
  "email/import": typeof email_import;
  evidence: typeof evidence;
  excelImport: typeof excelImport;
  http: typeof http;
  imports: typeof imports;
  index: typeof index;
  "lib/auth": typeof lib_auth;
  "lib/dates": typeof lib_dates;
  "lib/provisioning": typeof lib_provisioning;
  "lib/tiktakParser": typeof lib_tiktakParser;
  "lib/tiktakValues": typeof lib_tiktakValues;
  markets: typeof markets;
  orders: typeof orders;
  receipts: typeof receipts;
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

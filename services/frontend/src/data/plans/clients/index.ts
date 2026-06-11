// Aggregate of every code-defined client plan. Adding a new client is
// two changes:
//   1. Drop a `clients/<code>.ts` file next to noi.ts.
//   2. Import + register it here.
//
// The clientCode is the canonical id used in routes (`/plan/<CODE>`) and
// in the localStorage shim — keep it uppercase to match `client-codes.ts`.

import type { ClientPlan } from '../types';
import { noiPlan } from './noi';

export const clientPlans: ClientPlan[] = [noiPlan];

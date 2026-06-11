// Aggregate of every code-defined ("DaaC") client dashboard. Adding a
// new client is two changes:
//   1. Drop a `clients/<code>.ts` file next to noi.ts.
//   2. Import + add it to `clientDashboards` here.
//
// Routes (`/dashboards/<CODE>`) and lookups (`isClientCode`) read the
// canonical id off each `Dashboard` — there's no second registry to keep
// in sync.

import type { Dashboard } from '../types';
import { noiDashboard } from './noi';

export const clientDashboards: Dashboard[] = [noiDashboard];

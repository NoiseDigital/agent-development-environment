// The Client shape — the only entity here that survives the move to all-BQ
// data. The per-tenant client REGISTRY (the array) now lives under
// data/tenants/<id>/clients.ts and resolves through the @tenant-content build
// alias; the shared facade (@/data/clients) reads it. When more clients land,
// each needs its OWN live dataset (don't reintroduce the deleted mock pattern).

export interface Client {
  id: string;
  name: string;
  initials: string;
  accentColor: string;
  /** Public path to the client's brand mark (e.g. /noise_N.PNG). Cards fall
   *  back to a rendered initials badge when this is absent. */
  logoPath?: string;
}

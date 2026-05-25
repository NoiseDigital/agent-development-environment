// Client registry — the only entity here that survives the move to all-BQ
// data. The previous mock pipeline (Campaign → AdLine → PerformanceDay) and
// its three placeholder clients (Horizon / Bloom / NorthEdge) were removed
// once every dashboard tile went live against
// `media_campaign_performance_NOI`. When more clients land, each one needs
// its OWN live dataset — adding an entry here without that wiring would
// re-introduce the mock pattern this cleanup deleted.

export interface Client {
  id: string;
  name: string;
  initials: string;
  accentColor: string;
  /** Public path to the client's brand mark (e.g. /noise_N.PNG). Cards fall
   *  back to a rendered initials badge when this is absent. */
  logoPath?: string;
}

export const clients: Client[] = [
  { id: 'noi', name: 'Noise', initials: 'NOI', accentColor: '#000000', logoPath: '/noise_N.PNG' },
];

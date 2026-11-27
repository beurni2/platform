// FIXTURE NÉGATIVE : une retenue sur les ventes du vendeur quand une
// réclamation est tranchée contre lui. La gate DOIT échouer sur ce fichier.
// Ne jamais l'importer.
export interface DecisionReclamationAvecRetenue {
  reclamationId: string;
  retenueSurVentesFcfa: number;
}

// FIXTURE NÉGATIVE : l'argent d'un vendeur porté par une fiche de réclamation
// du fonds. La gate DOIT échouer sur ce fichier. Ne jamais l'importer.
export interface FicheReclamationAvecArgentVendeur {
  reclamationId: string;
  soldeVendeurFcfa: number;
}

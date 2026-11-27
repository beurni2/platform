// FIXTURE NÉGATIVE : une caution demandée au vendeur, sur une fiche de
// réclamation du fonds. Loi 4 : zéro caution, jamais. La gate DOIT échouer sur
// ce fichier. Ne jamais l'importer.
export interface FicheReclamationAvecCaution {
  reclamationId: string;
  cautionVendeurFcfa: number;
}

export type BlockchainTransactionAuditEntry = {
  hashTransaccion: string;
  numeroBloque: number;
  marcaTiempo: string;
  contratoEtiqueta: string;
  nombreEvento: string;
  descripcionLegible: string;
  explorerUrl: string;
  logIndex?: number;
};

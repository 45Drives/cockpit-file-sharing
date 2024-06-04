export type NFSExport = {
  name: string;
  path: string;
  clients: NFSExportClient[];
};

export type NFSExportClient = {
  host: string;
  settings: string[];
};

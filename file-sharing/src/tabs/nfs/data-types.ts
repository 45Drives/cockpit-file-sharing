import { v4 as uuidv4 } from "uuid";

export type NFSClientOptions = string;

export function defaultNFSClientOptions(): NFSClientOptions {
  return "";
}

export function newNFSClientOptions(): NFSClientOptions {
  return "rw,sync,no_subtree_check";
}

export function defaultNFSDefaultClientOptions(): NFSClientOptions {
  return "";
}

export function newNFSDefaultClientOptions(): NFSClientOptions {
  return `fsid=${uuidv4()}`;
}

export type NFSExportClient = {
  host: string;
  settings: NFSClientOptions;
};

export type NFSExport = {
  path: string;
  defaultClientSettings: NFSClientOptions;
  clients: NFSExportClient[];
  comment: string;
};

export function defaultNFSExport(): NFSExport {
  return {
    path: "",
    defaultClientSettings: defaultNFSDefaultClientOptions(),
    clients: [],
    comment: "",
  };
}

export function newNFSExport(): NFSExport {
  return {
    path: "",
    defaultClientSettings: newNFSDefaultClientOptions(),
    clients: [newNFSExportClient()],
    comment: "",
  };
}

export function newNFSExportClient(): NFSExportClient {
  return {
    host: "*",
    settings: newNFSClientOptions(),
  };
}

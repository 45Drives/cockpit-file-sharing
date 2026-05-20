export type ClientProtocol = "samba" | "nfs";

export interface ConnectedClient {
  /** Stable per-row key (e.g. `${protocol}:${sessionId}/${tconId}` or `nfs:${clientId}`) */
  id: string;
  protocol: ClientProtocol;
  /** Authenticated username, when the protocol exposes one (Samba only today). */
  user: string | null;
  ip: string;
  hostname: string | null;
  /** e.g. "SMB3_11", "NFSv4.2". */
  protocolVersion: string;
  /** Samba: share name per tcon. NFS: null (kernel doesn't surface per-export here). */
  share: string | null;
  /** When the session/tcon was established. NFS clients have no exposed timestamp. */
  connectedSince: Date | null;
  openFiles: number;
  encrypted: boolean;
}

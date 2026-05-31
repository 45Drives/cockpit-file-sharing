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
  /**
   * Samba: share name per tcon. NFS: comma-joined list of exports the client
   * is *actively using* (derived by mapping each open file's superblock back
   * to a mount path and then to an /etc/exports entry). NFSv4 has no per-
   * client mount list at the server, so an idle-but-mounted NFS client shows
   * null here. The UI surfaces this caveat via a hover tooltip.
   */
  share: string | null;
  /**
   * When the session/tcon was established. Samba surfaces this directly per
   * tcon; NFS has no dedicated "connected at" field (the kernel's only time
   * value is `seconds from last renew`, which resets on every NFSv4 lease
   * renewal), so we use the `/proc/fs/nfsd/clients/<id>/` dentry mtime as a
   * proxy — it's set on first confirm and only changes on lease expiry +
   * reconnect, which matches the operator's notion of "connected since".
   */
  connectedSince: Date | null;
  openFiles: number;
  encrypted: boolean;
}

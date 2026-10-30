/**
 * Client export options validation.
 *
 * Single source of truth for the exports(5) option names Houston knows about.
 * Unknown `key=value` options are treated as advanced options and only warn,
 * so a new exports(5) option can never block the UI again; unknown bare
 * keywords are still errors since they are almost certainly typos.
 */
export const NFS_BOOL_OPTS = [
  "secure",
  "insecure",
  "rw",
  "ro",
  "async",
  "sync",
  "no_wdelay",
  "wdelay",
  "nohide",
  "hide",
  "crossmnt",
  "no_subtree_check",
  "subtree_check",
  "insecure_locks",
  "no_auth_nlm",
  "auth_nlm",
  "secure_locks",
  "no_acl",
  "mountpoint",
  "mp",
  "root_squash",
  "no_root_squash",
  "all_squash",
  "no_all_squash",
  "pinclient",
];

// All of these require a `key=value` form; bare usage is an error.
export const NFS_ARGUMENT_OPTS = [
  "mountpoint",
  "mp",
  "fsid",
  "refer",
  "replicas",
  "anonuid",
  "anongid",
  "sec",
  "protocols",
  "mountgids",
];

// These take comma-separated value lists, e.g. protocols=2,3,4 — bare
// tokens after one belong to its value, per exports(5).
const NFS_LIST_VALUE_OPTS = ["protocols", "mountgids"];

export type ClientOptionResult = {
  type: "success" | "warning" | "error";
  message?: string;
};

export const clientOptionsSuccess: ClientOptionResult = { type: "success" };

export function validateNFSClientOptions(optionList: string): ClientOptionResult {
  if (!optionList) {
    return clientOptionsSuccess;
  }
  if (/\s/.test(optionList)) {
    return { type: "error", message: "Whitespace not permitted." };
  }
  const bad: string[] = [];
  const advanced: string[] = [];
  let inListValue = false;
  for (const opt of optionList.split(",")) {
    const eqIndex = opt.indexOf("=");
    const isValueForm = eqIndex > 0;
    const key = isValueForm ? opt.slice(0, eqIndex) : opt;
    // known | advanced (unknown key=value, may be a newer exports(5) option)
    // | bad (malformed, unknown bare keyword, or option name missing its value)
    // | list-continue (bare token that extends a protocols=/mountgids= list)
    let kind: "known" | "advanced" | "bad" | "list-continue";
    if (isValueForm) {
      kind = isKnownNFSClientOption(opt) ? "known" : "advanced";
    } else if (eqIndex === 0) {
      kind = "bad";
    } else if (NFS_BOOL_OPTS.includes(opt)) {
      kind = "known";
    } else if (inListValue) {
      kind = "list-continue";
    } else {
      kind = "bad";
    }
    if (kind === "bad") {
      bad.push(opt);
    } else if (kind === "advanced") {
      advanced.push(opt);
    }
    inListValue = isValueForm ? NFS_LIST_VALUE_OPTS.includes(key) : kind === "list-continue";
  }
  if (bad.length) {
    return {
      type: "error",
      message: `Bad options: ${bad.map((opt) => `"${opt}"`).join(", ")}`,
    };
  }
  if (advanced.length) {
    return {
      type: "warning",
      message: `Unrecognized options: ${advanced.map((opt) => `"${opt}"`).join(", ")}. See man exports(5).`,
    };
  }
  return clientOptionsSuccess;
}

export function isKnownNFSClientOption(opt: string): boolean {
  if (NFS_BOOL_OPTS.includes(opt)) {
    return true;
  }
  const eqIndex = opt.indexOf("=");
  if (eqIndex <= 0) {
    return false;
  }
  return NFS_ARGUMENT_OPTS.includes(opt.slice(0, eqIndex));
}

import { type SyntaxParser } from "@45drives/houston-common-lib";
import { type NFSExport } from "@/tabs/nfs/data-types";
import { ok } from "neverthrow";

export const NFSExportsParser = (): SyntaxParser<NFSExport[]> => {
  return { apply: (raw) => ok([]), unapply: (exports) => ok("") };
};

import {
  SambaShareConfig,
  type ISambaManager,
  SambaManagerNet as SambaManager,
} from "@45drives/houston-common-lib";
import { executeHookCallbacks, Hooks } from "@/common/hooks";

export class HookedSambaManager extends SambaManager implements ISambaManager {
  addShare(share: SambaShareConfig) {
    return executeHookCallbacks(Hooks.BeforeAddShare, this.server, share)
      .andThen(() => super.addShare(share))
      .andThen(() => executeHookCallbacks(Hooks.AfterAddShare, this.server, share))
      .map(() => share);
  }

  editShare(share: SambaShareConfig) {
    return executeHookCallbacks(Hooks.BeforeEditShare, this.server, share)
      .andThen(() => super.editShare(share))
      .andThen(() => executeHookCallbacks(Hooks.AfterEditShare, this.server, share))
      .map(() => share);
  }

  removeShare(share: SambaShareConfig) {
    return executeHookCallbacks(Hooks.BeforeRemoveShare, this.server, share)
      .andThen(() => super.removeShare(share))
      .andThen(() => executeHookCallbacks(Hooks.AfterRemoveShare, this.server, share))
      .map(() => share);
  }
}

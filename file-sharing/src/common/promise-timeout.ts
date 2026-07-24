import { Notification, pushNotification } from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

export function promiseTimeout<T>(func: () => Promise<T>, seconds: number): Promise<T>;
export function promiseTimeout<T>(
  func: () => Promise<T>,
  seconds: number,
  promptToWait: true,
  description: string
): Promise<T>;
export function promiseTimeout<T>(
  func: () => Promise<T>,
  seconds: number,
  promptToWait: boolean = false,
  description: string = "Process"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const result = func();
    let t: ReturnType<typeof globalThis.setTimeout>;

    if (promptToWait) {
      const notif = new Notification(
        _("Process not responding"),
        description + _(" took longer than ") + seconds + "s",
        "warning",
        "never"
      )
        .addAction(
          _("Wait longer"),
          () => resolve(promiseTimeout(() => result, seconds, true, description)),
          true
        )
        .addAction(_("Give up"), () => reject(), true);
      t = globalThis.setTimeout(() => {
        pushNotification(notif);
        result.finally(() => {
          notif.remove();
        });
      }, seconds * 1000);
    } else {
      t = globalThis.setTimeout(() => reject(), seconds * 1000);
    }

    result.then(resolve);
    result.catch(reject);
    result.finally(() => {
      globalThis.clearTimeout(t);
    });
  });
}

import { computed, type WritableComputedRef } from "vue";

export const BooleanKeyValueSuite = (
  objGetter: () => Record<string, string>,
  trueContents: { include: Record<string, string>; exclude: Record<string, string> }
) => {
  return computed<boolean>({
    get() {
      for (const [key, unwantedValuesString] of Object.entries(trueContents.exclude)) {
        const unwantedValues = unwantedValuesString.split(/\s+/);
        const currentValues = objGetter()[key]?.split(/\s+/);
        if (
          currentValues !== undefined &&
          unwantedValues.some((unwantedValue) => currentValues.includes(unwantedValue))
        ) {
          return false;
        }
      }
      for (const [key, wantedValuesString] of Object.entries(trueContents.include)) {
        const wantedValues = wantedValuesString.split(/\s+/);
        const currentValues = objGetter()[key]?.split(/\s+/);
        if (currentValues === undefined) {
          return false;
        }
        if (!wantedValues.every((wantedValue) => currentValues.includes(wantedValue))) {
          return false;
        }
      }
      return true;
    },
    set(value) {
      if (value) {
        // remove excluded
        for (const [key, unwantedValuesString] of Object.entries(trueContents.exclude)) {
          const unwantedValues = unwantedValuesString.split(/\s+/);
          const currentValues = objGetter()[key]?.split(/\s+/) ?? [];
          const filteredValues = currentValues.filter((v) => !unwantedValues.includes(v));
          if (filteredValues.length) {
            objGetter()[key] = filteredValues.join(" ");
          } else {
            delete objGetter()[key];
          }
        }
      }
      for (const [key, wantedValuesString] of Object.entries(trueContents.include)) {
        const wantedValues = wantedValuesString.split(/\s+/);
        const currentValues = objGetter()[key]?.split(/\s+/) ?? [];
        if (value) {
          // add included
          objGetter()[key] = [...new Set([...currentValues, ...wantedValues])].join(" ");
        } else {
          // remove included
          const filteredValues = currentValues.filter((v) => !wantedValues.includes(v));
          if (filteredValues.length) {
            objGetter()[key] = filteredValues.join(" ");
          } else {
            delete objGetter()[key];
          }
        }
      }
    },
  });
};

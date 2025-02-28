import { computed } from "vue";

export const BooleanKeyValueSuite = (
  objGetter: () => Record<string, string>,
  trueContents: {
    include: Record<string, string | string[]>;
    exclude: Record<string, string | string[]>;
    suggest?: Record<string, string | string[]>;
  },
  arraySplitter: RegExp = /\s+/,
  arrayJoiner: string = " "
) => {
  const includesOption = (obj: Record<string, string>, key: string, value: string): boolean => {
    const current = obj[key]?.trim();
    return current === value;
  };

  const includesOptionAll = (
    obj: Record<string, string>,
    key: string,
    value: string | string[]
  ): boolean => {
    if (typeof value === "string") {
      return includesOption(obj, key, value);
    }
    const current = obj[key]?.split(arraySplitter);
    return current !== undefined && value.every((value) => current.includes(value));
  };

  const includesOptionAny = (
    obj: Record<string, string>,
    key: string,
    value: string | string[]
  ): boolean => {
    if (typeof value === "string") {
      return includesOption(obj, key, value);
    }
    const current = obj[key]?.split(arraySplitter);
    return current !== undefined && value.some((value) => current.includes(value));
  };

  const includesOptionsAll = (
    obj: Record<string, string>,
    options: [string, string | string[]][]
  ): boolean => {
    return options.every(([key, value]) => includesOptionAll(obj, key, value));
  };

  const includesOptionsAny = (
    obj: Record<string, string>,
    options: [string, string | string[]][]
  ): boolean => {
    return options.some(([key, value]) => includesOptionAny(obj, key, value));
  };

  const addOption = (obj: Record<string, string>, key: string, value: string | string[]) => {
    if (Array.isArray(value)) {
      const currentValues = obj[key]?.split(arraySplitter) ?? [];
      obj[key] = [...new Set([...currentValues, ...value])].join(arrayJoiner);
    } else {
      obj[key] = value;
    }
  };

  const addOptions = (obj: Record<string, string>, options: [string, string | string[]][]) => {
    options.forEach(([key, value]) => addOption(obj, key, value));
  };

  const removeOption = (obj: Record<string, string>, key: string, value: string | string[]) => {
    if (Array.isArray(value)) {
      const currentValues = obj[key]?.split(arraySplitter) ?? [];
      const filteredValues = currentValues.filter((v) => !value.includes(v));
      if (filteredValues.length) {
        obj[key] = filteredValues.join(arrayJoiner);
      } else {
        delete obj[key];
      }
    } else {
      const current = obj[key]?.trim();
      if (current === value) {
        delete obj[key];
      }
    }
  };

  const removeOptions = (obj: Record<string, string>, options: [string, string | string[]][]) => {
    options.forEach(([key, value]) => removeOption(obj, key, value));
  };

  const includedOptions = Object.entries(trueContents.include);
  const excludedOptions = Object.entries(trueContents.exclude);
  const suggestedOptions = Object.entries(trueContents.suggest ?? {});

  return computed<boolean>({
    get() {
      const obj = objGetter();
      return includesOptionsAll(obj, includedOptions) && !includesOptionsAny(obj, excludedOptions);
    },
    set(value) {
      const obj = objGetter();
      if (value) {
        removeOptions(obj, excludedOptions);
        addOptions(obj, [...includedOptions, ...suggestedOptions]);
      } else {
        removeOptions(obj, [...includedOptions, ...suggestedOptions]);
      }
    },
  });
};

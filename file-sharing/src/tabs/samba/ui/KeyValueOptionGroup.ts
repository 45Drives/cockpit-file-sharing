export class KeyValueOptionGroup {
  private requiredValues: {
    true: Record<string, string[]>;
    false: Record<string, string[]>;
  };
  private excludedValues: {
    true: Record<string, string[]>;
    false: Record<string, string[]>;
  };
  private optionalValues: {
    true: Record<string, string[]>;
    false: Record<string, string[]>;
  };
  private excludedKeys: {
    true: (string | RegExp)[];
    false: (string | RegExp)[];
  };

  constructor(private objectGetter: () => Record<string, string>) {
    this.requiredValues = {
      true: {},
      false: {},
    };
    this.excludedValues = {
      true: {},
      false: {},
    };
    this.optionalValues = {
      true: {},
      false: {},
    };
    this.excludedKeys = {
      true: [],
      false: [],
    };
  }

  requireValuesIf(condition: boolean, key: string, ...values: string[]): this {
    this.addValuesToObj(
      this.requiredValues[condition.toString() as "true" | "false"],
      key,
      ...values
    );
    return this;
  }

  excludeValuesIf(condition: boolean, key: string, ...values: string[]): this {
    this.addValuesToObj(
      this.excludedValues[condition.toString() as "true" | "false"],
      key,
      ...values
    );
    return this;
  }

  setOptionalValuesIf(condition: boolean, key: string, ...values: string[]): this {
    this.addValuesToObj(
      this.optionalValues[condition.toString() as "true" | "false"],
      key,
      ...values
    );
    return this;
  }

  excludeKeysIf(condition: boolean, ...keys: (string | RegExp)[]): this {
    keys = keys.map((k) => (typeof k === "string" ? k.split(/\s+/) : k)).flat();
    this.excludedKeys[condition.toString() as "true" | "false"].push(...keys);
    return this;
  }

  setBool(value: boolean): this {
    const obj = this.objectGetter();
    const valuesToAdd = {
      ...this.requiredValues[value.toString() as "true" | "false"],
      ...this.optionalValues[value.toString() as "true" | "false"],
    };
    const valuesToRemove = {
      ...this.excludedValues[value.toString() as "true" | "false"],
      ...this.requiredValues[(!value).toString() as "true" | "false"],
    };
    const keysToRemove = this.excludedKeys[value.toString() as "true" | "false"];

    for (const [key, values] of Object.entries(valuesToAdd)) {
      const currentValues = obj[key] ? obj[key]!.split(/\s+/) : [];
      const newValues = [...new Set([...currentValues, ...values])];
      obj[key] = newValues.join(" ");
    }
    for (const [key, values] of Object.entries(valuesToRemove)) {
      const currentValues = obj[key] ? obj[key]!.split(/\s+/) : [];
      const newValues = currentValues.filter((value) => !values.includes(value));
      obj[key] = newValues.join(" ");
      if (obj[key] === "") {
        delete obj[key];
      }
    }
    for (const key of keysToRemove) {
      if (typeof key === "string") {
        delete obj[key];
      } else {
        for (const objKey of Object.keys(obj)) {
          if (key.test(objKey)) {
            delete obj[objKey];
          }
        }
      }
    }

    return this;
  }

  getBool(): boolean {
    const obj = this.objectGetter();
    const satisfiesCondition = (condition: boolean) => {
      const requiredValues = this.requiredValues[condition.toString() as "true" | "false"];
      for (const [key, values] of Object.entries(requiredValues)) {
        if (obj[key] === undefined) {
          // obj is missing key
          return false;
        }
        const currentValues = obj[key] ? obj[key]!.split(/\s+/) : [];
        if (values.some((value) => !currentValues.includes(value))) {
          // obj[key] is missing value
          return false;
        }
      }
      const excludedValues = this.excludedValues[condition.toString() as "true" | "false"];
      for (const [key, values] of Object.entries(excludedValues)) {
        if (obj[key] === undefined) {
          // obj is missing key
          continue;
        }
        const currentValues = obj[key] ? obj[key]!.split(/\s+/) : [];
        if (values.some((value) => currentValues.includes(value))) {
          // obj[key] contains value
          return false;
        }
      }
      return true;
    };
    if (satisfiesCondition(true)) {
      return true;
    }
    if (satisfiesCondition(false)) {
      return false;
    }
    console.warn(
      "KeyValueOptionGroup.getBool(): neither true condition nor false condition satisfied for object:",
      this.objectGetter()
    );
    console.warn("this:", this);
    return false;
  }

  toGetterSetter() {
    return {
      set: (value: boolean) => {
        this.setBool(value);
      },
      get: () => {
        return this.getBool();
      },
    };
  }

  private addValuesToObj(obj: Record<string, string[]>, key: string, ...values: string[]) {
    values = values.flatMap((s) => s.split(/\s+/));
    obj[key] = obj[key] ? [...(obj[key] as string[]), ...values] : values;
  }
}

import { computed } from 'vue';

export const BooleanKeyValueSuite = (objGetter: () => Record<string, string>, trueContents: Record<string, string>) => {
    return computed<boolean>({
        get() {
            for (const key of Object.keys(trueContents)) {
                const wantedValues = trueContents[key]!.split(/\s+/);
                const currentValues = objGetter()[key]?.split(/\s+/);
                console.log(key, "want:", wantedValues, "has:", currentValues);
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
            for (const key of Object.keys(trueContents)) {
                const wantedValues = trueContents[key]!.split(/\s+/);
                const currentValues = objGetter()[key]?.split(/\s+/) ?? [];
                if (value) {
                    // add
                    objGetter()[key] = [...new Set([...currentValues, ...wantedValues])].join(" ");
                } else {
                    // remove
                    const filteredValues = currentValues.filter((v) => !wantedValues.includes(v));
                    if (filteredValues.length) {
                        objGetter()[key] = filteredValues.join(" ");
                    } else {
                        delete objGetter()[key];
                    }
                }
            }
        }
    });
};

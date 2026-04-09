function assertOptionValue(name: string, value: string | undefined): asserts value is string {
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
}

export function readOptionValue(args: string[], name: string): string | undefined {
  let result: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }

    const value = args[index + 1];
    assertOptionValue(name, value);
    if (result === undefined) {
      result = value;
    }
  }

  return result;
}

export function readMultiOptionValues(args: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }

    const value = args[index + 1];
    assertOptionValue(name, value);
    values.push(value);
  }

  return values;
}

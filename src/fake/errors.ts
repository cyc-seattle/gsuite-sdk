/** The JSON body Google's Directory and Groups Settings APIs send with an error. */
export interface GoogleErrorBody {
  error: {
    code: number;
    message: string;
    errors: { message: string; domain: string; reason: string }[];
  };
}

/** An error the fake answers with, carrying the status and body Google would send. */
export class FakeApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "FakeApiError";
  }

  get body(): GoogleErrorBody {
    return {
      error: {
        code: this.status,
        message: this.message,
        errors: [{ message: this.message, domain: "global", reason: this.reason }],
      },
    };
  }
}

/** A 404 naming the key it couldn't resolve, such as `groupKey` or `memberKey`. */
export function notFound(key: string): FakeApiError {
  return new FakeApiError(404, "notFound", `Resource Not Found: ${key}`);
}

export function invalidInput(field: string): FakeApiError {
  return new FakeApiError(400, "invalid", `Invalid Input: ${field}`);
}

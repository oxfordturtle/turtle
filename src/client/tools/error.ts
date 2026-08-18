export class SystemError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * How anything reports a failure to the user.
 *
 * A *registered* handler rather than a direct `alert`, because the callers are
 * island modules and the server imports those too: `alert` exists in Deno and
 * blocks on stdin, so a server-side call would hang the process rather than
 * fail. Off the browser this logs and carries on.
 */
export const showError = (error: unknown): void => {
  handler(error);
};

/** Installs the handler. Called once, from the client entry. */
export const setErrorHandler = (newHandler: (error: unknown) => void): void => {
  handler = newHandler;
};

let handler: (error: unknown) => void = (error) => {
  console.error(error);
};

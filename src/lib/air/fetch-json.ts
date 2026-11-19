/**
 * JSON fetch for Open-Meteo with a timeout and one retry. Failures become
 * `AirDataError`s so routes can turn them into clear status codes.
 */

const TIMEOUT_MS = 6000;

export class AirDataError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "upstream",
  ) {
    super(message);
    this.name = "AirDataError";
  }
}

export type FetchLike = typeof fetch;

/** One quick retry covers the odd dropped connection without slowing real failures much. */
const ATTEMPTS = 2;

export async function getJson(url: URL, fetcher: FetchLike): Promise<unknown> {
  let response: Response | undefined;
  for (let attempt = 1; attempt <= ATTEMPTS && !response; attempt++) {
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status >= 500 && attempt < ATTEMPTS) response = undefined;
    } catch (error) {
      console.warn(
        `Open-Meteo request failed (attempt ${attempt})`,
        error instanceof Error ? (error.cause ?? error) : error,
      );
    }
  }
  if (!response) {
    throw new AirDataError("Air quality service did not respond", "upstream");
  }
  if (!response.ok) {
    throw new AirDataError(`Air quality service returned ${response.status}`, "upstream");
  }
  return response.json();
}

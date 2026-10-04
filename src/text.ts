/**
 * Counts a noun, such as `1 test` or `2 tests`.
 */
const plural = (count: number, noun: string): string => {
  if (count === 1) {
    return `1 ${noun}`
  }
  return `${count} ${noun}s`
}

/**
 * The message of an error, or the thrown value itself when it isn't an Error.
 */
const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export { errorMessage, plural }

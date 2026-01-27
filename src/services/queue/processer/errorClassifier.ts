import {
  ErrorType,
  END_OF_QUEUE_INDICATORS,
  ErrorClassification,
  QueueResponse,
} from "../../../constants/QueueConstant";

/**
 * Classifies errors from queue responses
 */
export class ErrorClassifier {
  /**
   * Classify an error from a queue response
   * @param response - The queue response object
   * @param error - The error object (if any)
   * @returns Error classification with type and recovery strategy
   */
  static classify(
    response?: QueueResponse | null,
    error?: Error | null,
  ): ErrorClassification {
    // Check for end of queue in response
    if (response) {
      const queueError =
        response?.Envelope?.Body?.QueueAccessRS?.ApplicationResults?.Error;

      if (queueError) {
        const errorText = queueError.SystemSpecificResults?.ShortText || "";
        const errorCode = queueError.Code || "";

        // Check for end of queue
        if (this.isEndOfQueue(errorText)) {
          return {
            type: ErrorType.END_OF_QUEUE,
            message: errorText,
            isRecoverable: false,
            shouldRetry: false,
          };
        }

        // Check for session errors
        if (this.isSessionError(errorText, errorCode)) {
          return {
            type: ErrorType.SESSION_ERROR,
            message: errorText,
            isRecoverable: true,
            shouldRetry: true,
          };
        }

        // Check for transient errors
        if (this.isTransientError(errorText, errorCode)) {
          return {
            type: ErrorType.TRANSIENT,
            message: errorText,
            isRecoverable: true,
            shouldRetry: true,
          };
        }

        // Item-specific error
        return {
          type: ErrorType.ITEM_ERROR,
          message: errorText,
          isRecoverable: true,
          shouldRetry: false,
        };
      }
    }

    // Classify JavaScript errors
    if (error) {
      const errorMessage = error.message || String(error);

      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("ETIMEDOUT")
      ) {
        return {
          type: ErrorType.TRANSIENT,
          message: errorMessage,
          isRecoverable: true,
          shouldRetry: true,
        };
      }

      if (
        errorMessage.includes("session") ||
        errorMessage.includes("unauthorized")
      ) {
        return {
          type: ErrorType.SESSION_ERROR,
          message: errorMessage,
          isRecoverable: true,
          shouldRetry: true,
        };
      }

      if (
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ENOTFOUND")
      ) {
        return {
          type: ErrorType.TRANSIENT,
          message: errorMessage,
          isRecoverable: true,
          shouldRetry: true,
        };
      }

      // Unknown error - treat as fatal
      return {
        type: ErrorType.FATAL,
        message: errorMessage,
        isRecoverable: false,
        shouldRetry: false,
      };
    }

    return {
      type: ErrorType.FATAL,
      message: "Unknown error",
      isRecoverable: false,
      shouldRetry: false,
    };
  }

  /**
   * Check if error indicates end of queue
   */
  static isEndOfQueue(errorText: string): boolean {
    const normalizedText = (errorText || "").toUpperCase();
    return END_OF_QUEUE_INDICATORS.some((indicator) =>
      normalizedText.includes(indicator),
    );
  }

  /**
   * Check if error is session-related
   */
  static isSessionError(errorText: string, errorCode: string): boolean {
    const normalizedText = (errorText || "").toUpperCase();
    const sessionIndicators = [
      "SESSION",
      "UNAUTHORIZED",
      "AUTHENTICATION",
      "TOKEN EXPIRED",
    ];

    return (
      sessionIndicators.some((indicator) =>
        normalizedText.includes(indicator),
      ) ||
      errorCode === "401" ||
      errorCode === "403"
    );
  }

  /**
   * Check if error is transient (retry-able)
   */
  static isTransientError(errorText: string, errorCode: string): boolean {
    const normalizedText = (errorText || "").toUpperCase();
    const transientIndicators = [
      "TIMEOUT",
      "TEMPORARY",
      "UNAVAILABLE",
      "SERVICE ERROR",
      "TRY AGAIN",
    ];

    return (
      transientIndicators.some((indicator) =>
        normalizedText.includes(indicator),
      ) ||
      errorCode === "503" ||
      errorCode === "504"
    );
  }
}

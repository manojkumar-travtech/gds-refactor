interface QueueResponse {
  Envelope?: {
    Body?: {
      QueueAccessRS?: {
        ApplicationResults?: {
          Error?: { $: { Code: string; Message: string } };
          Info?: any;
          Warning?: any;
          Success?: any;
          Paragraph?: any;
        };
        Line?:
          | {
              UniqueID?: any;
              PNRBFManagement_RS?: any;
            }
          | Array<{ UniqueID?: any; PNRBFManagement_RS?: any }>;
      };
    };
  };
}

/**
 * Checks if the response contains a valid queue item
 * @param {QueueResponse} response - The API response
 * @returns {boolean} True if the response contains a valid queue item
 */
const hasQueueItem = (response: QueueResponse): boolean => {
  try {
    if (!response?.Envelope?.Body) {
      console.log("Invalid response structure - missing required elements");
      return false;
    }

    const queueAccessRS = response.Envelope.Body.QueueAccessRS;
    if (!queueAccessRS) {
      console.log("No QueueAccessRS in response body");
      return false;
    }

    const appResults = queueAccessRS?.ApplicationResults;

    if (appResults) {
      // Check for errors
      if (appResults.Error) {
        const error = appResults.Error;
        console.log("*****************ERROR", error);
        console.log("Error in response:", {
          code: error.$.Code,
          message: error.$.Message,
        });
        return false;
      }

      // Info, Warning, Success logs
      if (appResults.Info) console.log("Info in response:", appResults.Info);
      if (appResults.Warning)
        console.log("Warning in response:", appResults.Warning);
      if (appResults.Success)
        console.log("Success message in response:", appResults.Success);

      // Paragraph might contain queue information
      if (appResults.Paragraph) {
        console.log("Paragraph content:", appResults.Paragraph);
        return true;
      }
    }

    // Check Line element
    if (queueAccessRS.Line) {
      const lines = Array.isArray(queueAccessRS.Line)
        ? queueAccessRS.Line
        : [queueAccessRS.Line];
      for (const line of lines) {
        if (line.UniqueID || line.PNRBFManagement_RS) {
          return true;
        }
      }
    }

    console.log("No valid queue item found in response");
    return false;
  } catch (error) {
    console.error("Error in hasQueueItem:", error);
    return false;
  }
};

export { hasQueueItem, QueueResponse };

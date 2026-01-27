import { QueueResponse } from "../../constants/QueueConstant";

/**
 * Checks if the response contains a valid queue item
 * @param {QueueResponse} response - The API response
 * @returns {boolean} True if the response contains a valid queue item
 */
const hasQueueItem = (response: any): boolean => {
  try {
    if (!response?.QueueAccessRS) {
      console.log("Invalid response - missing QueueAccessRS");
      return false;
    }

    const rs = response.QueueAccessRS;

    // Handle ApplicationResults (namespaced)
    const appResults = rs["stl:ApplicationResults"] || rs.ApplicationResults;

    if (appResults) {
      if (appResults.Error) {
        console.log("Queue Error:", appResults.Error);
        return false;
      }

      if (appResults.Warning) console.log("Queue Warning:", appResults.Warning);

      if (appResults.Info) console.log("Queue Info:", appResults.Info);

      if (appResults.Success) console.log("Queue Success:", appResults.Success);
    }

    // Check for valid queue item indicators
    const hasLineItem = !!rs?.Line?.UniqueID?.$?.ID;
    const hasParagraph =
      Array.isArray(rs?.Paragraph?.Text) && rs.Paragraph.Text.length > 0;

    if (hasLineItem || hasParagraph) {
      return true;
    }

    console.log("No valid queue item found");
    return false;
  } catch (error) {
    console.error("Error in hasQueueItem:", error);
    return false;
  }
};

export { hasQueueItem, QueueResponse };

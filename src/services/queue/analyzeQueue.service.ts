import logger from "../../utils/logger";

export class AnalyzeQueueService {
    
  public async analyzeQueue(queueNumber: string | null = null) {
    if (!queueNumber) {
      logger.warning("No Queue is provided");
      throw new Error(`Please Provide the queue number`);
    }
    const request = this.buildQueueAnalysisRequest(queueNumber);
    console.log("request", request);
  }
  private buildQueueAnalysisRequest(queueNumber: string) {
    console.log("queueNumber", queueNumber);
  }
}

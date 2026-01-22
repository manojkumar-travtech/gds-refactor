import { sendQueueRequest } from "../../connectors/Envelopes/buildSoapEnvelope";
import { buildQueueCountRequest } from "../../connectors/Envelopes/otherEnvelopes";
import { parseQueueCountResponse } from "../../parsers/parseQueueCountResponse";
import { BaseSabreService } from "../base-sabre.service";

export interface ActiveQueue {
  queueNumber: string;
  pnrCount: number;
}

export class SabreQueueService extends BaseSabreService {
  private static instance: SabreQueueService | null = null;
  private static instancePromise: Promise<SabreQueueService> | null = null;

  private constructor() {
    super();
  }

  /**
   * Async-safe singleton accessor
   */
  public static async getInstance(): Promise<SabreQueueService> {
    if (SabreQueueService.instance) {
      return SabreQueueService.instance;
    }

    if (!SabreQueueService.instancePromise) {
      SabreQueueService.instancePromise = (async () => {
        const service = new SabreQueueService();
        SabreQueueService.instance = service;
        return service;
      })();
    }

    return SabreQueueService.instancePromise;
  }

  async getQueueCount(queueNumber: string | number | null = null) {
    const sessionToken = await this.sessionService.getAccessToken();

    const body = buildQueueCountRequest({
      queueNumber: queueNumber ? String(queueNumber) : null,
      pcc: String(this.sabreConfig.pcc),
    });

    const response = await sendQueueRequest({
      service: "Queue",
      action: "QueueCountLLSRQ",
      organization: this.sabreConfig.organization,
      sessionToken,
      body,
      endpoint: this.sabreConfig.endpoint,
    });

    return parseQueueCountResponse(response, queueNumber);
  }

  async getActiveQueues(): Promise<ActiveQueue[]> {
    const result = await this.getQueueCount();

    return result.queues
      .filter((q) => q.count > 0)
      .map((q) => ({
        queueNumber: q.queueNumber,
        pnrCount: q.count,
      }));
  }
}
